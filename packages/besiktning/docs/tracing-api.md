# Tracing API and lifetimes

The `withOperation` addition documents an unpublished candidate, still carrying
source version 0.4.1; it is not the registry's 0.4.1 bytes. A future 0.5.0 minor
release is recommended, pending version/publication authorization. Do not assume
the currently published package has this addition. Source contract:
[`src/tracing.ts`](../src/tracing.ts).

## Ordinary synchronous and Promise work

```typescript
import { createTracing, withActiveSpan as withExplicitSpan } from 'besiktning/tracing';

const { tracer, withActiveSpan } = createTracing('example.orders', '1.0.0');
const result = withActiveSpan('order.calculate', (span) => {
    span.setAttribute('item.count', 3);
    return 42;
});
const saved = await withActiveSpan('order.save', async () => {
    return await Promise.resolve(result);
});
withExplicitSpan(tracer, 'order.inspect', () => saved);
```

`createTracing(name, version?)` returns `{ tracer, withActiveSpan, withOperation }`. Its bound
helper accepts `(name, callback, options?, parent?)`; the retained explicit helper
accepts `(tracer, name, callback, options?, parent?)`. Options, `Context`, spans
and tracers are native OpenTelemetry types re-exported by `besiktning/tracing`.
The helper preserves synchronous returns/throws; thenables return a Promise
preserving fulfillment/rejection, not Promise identity. It owns `span.end()`:
never end that span yourself, and return/await **all** work it measures.

A tracer identifies a stable instrumentation scope, not a service, request or
tenant. Use subsystem names, never IDs. A trace is the parent/child operation
tree; a span is one operation; a `Context` carries the current span and other
context values. Different tracers can contribute children to the same tree.
Service identity belongs to the application's SDK resource. The factory only
gets a tracer: it registers nothing. No provider is harmless/no-op; a tracer
obtained before application provider registration can use that provider later.

## Privacy-safe operations

```typescript
import { createTracing, withOperation, type OperationOutcome } from 'besiktning/tracing';

const operations = createTracing('example.orders');
const result = operations.withOperation(
    'order.validate',
    () => ({ valid: false }),
    (value): OperationOutcome => value.valid ? 'success' : 'failure'
);
withOperation(operations.tracer, 'order.inspect', () => result);
```

The bound signature is `withOperation(name, work, classifyResult?, options?)`;
the explicit helper prepends a native `tracer`. `work` is a zero-argument callback
invoked **immediately under the active span**, not an already-running Promise.
Synchronous returns/throws remain synchronous. PromiseLike work returns a Promise
preserving the resolved value's identity or original opaque rejection reason;
Promise identity is not promised. Return all work belonging to the operation.

The optional `(value: T) => OperationOutcome | undefined` classifier runs once on
fulfillment, before ending. The only annotation is `operation.outcome`, validated
without coercion against `'success' | 'failure' | 'error' | 'cancelled'`.
No classifier, `undefined`, invalid output or a thrown result classifier means
**no outcome annotation**, not inferred business success. No result properties
(such as `valid`, `success` or `status`) are guessed. `success`, `failure` and
`cancelled` leave span status UNSET; only `error` sets technical ERROR.

Throws/rejections default to `error` without inspecting their reason. The fourth
argument accepts only `{ classifyError?: (reason: unknown) => 'error' | 'cancelled' }`.
Applications can supply an explicit cancellation policy, for example
`{ classifyError: () => signal.aborted ? 'cancelled' : 'error' }`; no error name,
message or AbortError convention is inferred. Invalid/throwing error classifiers
fall back to `error`. Classifier failures never replace business settlement.

The helper owns one `span.end()` attempt after actual settlement and classification,
not at a cancellation request. Annotation/end failures cannot replace the business
result or reason. It records no exception events, raw results, errors, messages,
stacks or logs. Use fixed, non-sensitive operation names; application classifiers
and exporters remain application-owned. Tracer/span creation and context-manager
failures are outside this annotation-failure guarantee.

No SDK, provider or context manager is installed. With a stack-based browser
manager, synchronous scope and explicitly bound callbacks work; native `await`
does not automatically preserve context. This helper adds no async-context patch.
Native span options/explicit parenting remain available through `withActiveSpan`
or native tracer APIs; operation options deliberately only classify errors.

## Explicit parent versus a linked new trace

```typescript
import { context, createTracing, isSpanContextValid, ROOT_CONTEXT, trace } from 'besiktning/tracing';
import type { Context } from 'besiktning/tracing';

const operations = createTracing('example.jobs');
export function runRelated(parent: Context): void {
    operations.withActiveSpan('job.child', () => 1, {}, parent);
    const previous = trace.getSpanContext(parent);
    const links = previous && isSpanContextValid(previous) ? [{ context: previous }] : [];
    operations.withActiveSpan('job.new-trace', () => 2, { links }, ROOT_CONTEXT);
}
runRelated(context.active());
```

An explicit parent continues its trace; `ROOT_CONTEXT` starts a new one. A link
records a relationship without parenting. Do not fabricate IDs or copy raw API
strings into links. Navigation between traces in SigNoz depends on its installed
version/UI and whether **both** sampled traces and the link survive export and
retention. No clickable-link or complete-history guarantee is implied.

## Callbacks, events and browser native await

Do not wrap a void `emit`/registration call in the helper and assume its span
covers later completion. Use `factory.tracer`, capture context at invocation,
bind deferred callbacks, and manually end exactly once at the **owned** completion
boundary. For example, this function owns one scheduled synchronous callback:

```typescript
import { context, createTracing, SpanStatusCode, trace } from 'besiktning/tracing';

const callbacks = createTracing('example.callbacks');
export function schedule(work: () => void): void {
    const parent = context.active();
    const span = callbacks.tracer.startSpan('callback.work', {}, parent);
    const captured = trace.setSpan(parent, span);
    const complete = context.bind(captured, () => {
        try {
            work();
        } catch (error) {
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
        } finally {
            span.end();
        }
    });
    queueMicrotask(complete);
}
```

This is not an arbitrary async-work adapter: a Promise returned to its void
callback is not observed. For repeated/competing callbacks, use an end-once guard
without suppressing business callbacks; cover registration failure and cleanup.
Only await a returned Promise when the existing contract owns its rejection.

Browser context managers do not guarantee continuity across native `await`.
Capture context **before** awaiting and pass it explicitly afterward:

```typescript
import { context, createTracing } from 'besiktning/tracing';

const browser = createTracing('example.browser');
export async function load(): Promise<number> {
    const captured = context.active();
    await Promise.resolve();
    return browser.withActiveSpan('load.continuation', () => 42, {}, captured);
}
```

Likewise bind later callbacks to the captured context, not whatever is active
when they run. Explicit parenting alone does not repair every nested async API.

## Failure semantics

`withActiveSpan` retains its existing policy: thrown/rejected values are ERROR,
including cancellation; Error and
string failures are recorded **raw** as exception events. Application export
sanitization is required. This is not a statement that all existing business logs
are exposed or sanitized. Expected business results (for example an invalid GMR
with successful HTTP response) need not be span errors. Define cancellation and
business-outcome classification explicitly; use `withOperation` or native spans if this
failure policy does not fit. Do not change the helper to encode application rules.
