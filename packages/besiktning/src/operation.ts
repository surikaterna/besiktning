import { SpanStatusCode } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';

export type OperationOutcome = 'success' | 'failure' | 'error' | 'cancelled';

interface OperationOptions {
  classifyError?: (reason: unknown) => 'error' | 'cancelled';
}

function resultOutcome(value: unknown, classify?: (value: unknown) => unknown): OperationOutcome | undefined {
  try {
    const outcome = classify?.(value);
    return outcome === 'success' || outcome === 'failure' || outcome === 'error' || outcome === 'cancelled' ? outcome : undefined;
  } catch {
    return undefined;
  }
}

function errorOutcome(reason: unknown, options?: OperationOptions): 'error' | 'cancelled' {
  try {
    return options?.classifyError?.(reason) === 'cancelled' ? 'cancelled' : 'error';
  } catch {
    return 'error';
  }
}

function finish(span: Span, outcome: OperationOutcome | undefined): void {
  // Instrumentation must not replace business values or opaque failure reasons.
  try {
    if (outcome !== undefined) span.setAttribute('operation.outcome', outcome);
  } catch {}
  try {
    if (outcome === 'error') span.setStatus({ code: SpanStatusCode.ERROR });
  } catch {}
  try {
    span.end();
  } catch {}
}

function observe(span: Span, work: () => unknown, classify: ((value: unknown) => unknown) | undefined, options?: OperationOptions): unknown {
  try {
    const result = work();
    const then = result !== null && (typeof result === 'object' || typeof result === 'function') ? (result as PromiseLike<unknown>).then : undefined;
    if (typeof then !== 'function') {
      finish(span, resultOutcome(result, classify));
      return result;
    }
    // Capture then once; native assimilation owns multiple settlements and throws.
    return Promise.resolve({
      then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => Reflect.apply(then, result, [resolve, reject])
    }).then(
      (value) => {
        finish(span, resultOutcome(value, classify));
        return value;
      },
      (reason) => {
        finish(span, errorOutcome(reason, options));
        throw reason;
      }
    );
  } catch (reason) {
    finish(span, errorOutcome(reason, options));
    throw reason;
  }
}

export function withOperation<T>(
  tracer: Tracer,
  name: string,
  work: () => PromiseLike<T>,
  classifyResult?: (value: T) => OperationOutcome | undefined,
  options?: OperationOptions
): Promise<T>;
export function withOperation<T>(
  tracer: Tracer,
  name: string,
  work: () => T,
  classifyResult?: (value: T) => OperationOutcome | undefined,
  options?: OperationOptions
): T;
export function withOperation(
  tracer: Tracer,
  name: string,
  work: () => unknown,
  classifyResult?: (value: never) => OperationOutcome | undefined,
  options?: OperationOptions
): unknown {
  return tracer.startActiveSpan(name, (span) => observe(span, work, classifyResult as ((value: unknown) => unknown) | undefined, options));
}
