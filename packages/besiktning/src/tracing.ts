import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Context, Span, SpanOptions, Tracer } from '@opentelemetry/api';
import { withOperation } from './operation';
import type { OperationOutcome } from './operation';

export * from '@opentelemetry/api';
export { withOperation } from './operation';
export type { OperationOutcome } from './operation';

export interface Tracing {
  tracer: Tracer;
  withActiveSpan<T>(name: string, callback: (span: Span) => PromiseLike<T>, options?: SpanOptions, parent?: Context): Promise<T>;
  withActiveSpan<T>(name: string, callback: (span: Span) => T, options?: SpanOptions, parent?: Context): T;
  withOperation<T>(
    name: string,
    work: () => PromiseLike<T>,
    classifyResult?: (value: T) => OperationOutcome | undefined,
    options?: { classifyError?: (reason: unknown) => 'error' | 'cancelled' }
  ): Promise<T>;
  withOperation<T>(
    name: string,
    work: () => T,
    classifyResult?: (value: T) => OperationOutcome | undefined,
    options?: { classifyError?: (reason: unknown) => 'error' | 'cancelled' }
  ): T;
}

export function createTracing(scopeName: string, version?: string): Tracing {
  const tracer = trace.getTracer(scopeName, version);
  function boundWithActiveSpan<T>(name: string, callback: (span: Span) => PromiseLike<T>, options?: SpanOptions, parent?: Context): Promise<T>;
  function boundWithActiveSpan<T>(name: string, callback: (span: Span) => T, options?: SpanOptions, parent?: Context): T;
  function boundWithActiveSpan(name: string, callback: (span: Span) => unknown, options?: SpanOptions, parent?: Context): unknown {
    return withActiveSpan(tracer, name, callback, options, parent);
  }
  function boundWithOperation<T>(
    name: string,
    work: () => PromiseLike<T>,
    classifyResult?: (value: T) => OperationOutcome | undefined,
    options?: { classifyError?: (reason: unknown) => 'error' | 'cancelled' }
  ): Promise<T>;
  function boundWithOperation<T>(
    name: string,
    work: () => T,
    classifyResult?: (value: T) => OperationOutcome | undefined,
    options?: { classifyError?: (reason: unknown) => 'error' | 'cancelled' }
  ): T;
  function boundWithOperation(
    name: string,
    work: () => unknown,
    classifyResult?: (value: never) => OperationOutcome | undefined,
    options?: { classifyError?: (reason: unknown) => 'error' | 'cancelled' }
  ): unknown {
    return withOperation(tracer, name, work, classifyResult as ((value: unknown) => OperationOutcome | undefined) | undefined, options);
  }
  return { tracer, withActiveSpan: boundWithActiveSpan, withOperation: boundWithOperation };
}

function recordFailure(span: Span, error: unknown): void {
  if (error instanceof Error || typeof error === 'string') {
    span.recordException(error);
  }
  span.setStatus({ code: SpanStatusCode.ERROR });
}

function getThen(value: unknown): unknown {
  return value !== null && (typeof value === 'object' || typeof value === 'function') ? (value as PromiseLike<unknown>).then : undefined;
}

export function withActiveSpan<T>(tracer: Tracer, name: string, callback: (span: Span) => PromiseLike<T>, options?: SpanOptions, parent?: Context): Promise<T>;
export function withActiveSpan<T>(tracer: Tracer, name: string, callback: (span: Span) => T, options?: SpanOptions, parent?: Context): T;
export function withActiveSpan(
  tracer: Tracer,
  name: string,
  callback: (span: Span) => unknown,
  options: SpanOptions = {},
  parent: Context = context.active()
): unknown {
  return tracer.startActiveSpan(name, options, parent, (span) => {
    try {
      const result = callback(span);
      const then = getThen(result);
      if (typeof then === 'function') {
        // Let native assimilation schedule the captured method without rereading the accessor.
        return Promise.resolve({
          then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => Reflect.apply(then, result, [resolve, reject])
        }).then(
          (value) => {
            span.end();
            return value;
          },
          (error) => {
            recordFailure(span, error);
            span.end();
            throw error;
          }
        );
      }
      span.end();
      return result;
    } catch (error) {
      recordFailure(span, error);
      span.end();
      throw error;
    }
  });
}
