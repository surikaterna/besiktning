# Tracing API and lifetimes

This documents the PR 19 candidate (`bb96a23`), intended for besiktning 0.4.0;
publication and downstream clean-install validation are pending. Do not assume the
currently published package has these exports. Source contract:
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

`createTracing(name, version?)` returns `{ tracer, withActiveSpan }`. Its bound
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

The helper marks thrown/rejected values ERROR, including cancellation; Error and
string failures are recorded **raw** as exception events. Application export
sanitization is required. This is not a statement that all existing business logs
are exposed or sanitized. Expected business results (for example an invalid GMR
with successful HTTP response) need not be span errors. Define cancellation and
business-outcome classification explicitly; use native spans if the helper's
failure policy does not fit. Do not change the helper to encode application rules.
