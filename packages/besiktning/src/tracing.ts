import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Context, Span, SpanOptions, Tracer } from '@opentelemetry/api';

export * from '@opentelemetry/api';

export interface Tracing {
  tracer: Tracer;
  withActiveSpan<T>(name: string, callback: (span: Span) => PromiseLike<T>, options?: SpanOptions, parent?: Context): Promise<T>;
  withActiveSpan<T>(name: string, callback: (span: Span) => T, options?: SpanOptions, parent?: Context): T;
}

export function createTracing(scopeName: string, version?: string): Tracing {
  const tracer = trace.getTracer(scopeName, version);
  function boundWithActiveSpan<T>(name: string, callback: (span: Span) => PromiseLike<T>, options?: SpanOptions, parent?: Context): Promise<T>;
  function boundWithActiveSpan<T>(name: string, callback: (span: Span) => T, options?: SpanOptions, parent?: Context): T;
  function boundWithActiveSpan(name: string, callback: (span: Span) => unknown, options?: SpanOptions, parent?: Context): unknown {
    return withActiveSpan(tracer, name, callback, options, parent);
  }
  return { tracer, withActiveSpan: boundWithActiveSpan };
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
