# Transport contracts and privacy

The facade defines **no wire protocol**. Put W3C trace context in HTTP headers,
AMQP properties/headers or a reviewed Socket.IO transport envelope, never persisted
business payloads. Lynx's `__trace` field is a Lynx-specific envelope contract,
not a generic besiktning field. Keep carrier handling separate from domain data.

## Native propagation

```typescript
import { context, propagation, ROOT_CONTEXT } from 'besiktning/tracing';

const carrier: Record<string, string> = {};
propagation.inject(context.active(), carrier);
const extracted = propagation.extract(ROOT_CONTEXT, carrier);
```

This uses the **globally registered** propagator and requires the application's
context manager for active context. It is no-op without a propagator; a composite
propagator may inject baggage. For a trace-context-only boundary, use the native
`W3CTraceContextPropagator` from the application's compatible `@opentelemetry/core`
dependency with native getters/setters, not a handwritten traceparent parser.
Do not claim this generic example excludes baggage. Bound carrier input lengths,
allow only approved fields, extract from `ROOT_CONTEXT`, and let the native parser
validate. Missing/invalid metadata must not reject business work.

Use a fresh outgoing carrier. Remove reserved stale trace headers (including
`tracestate`) from copied envelopes before injecting a new context, or old state
can survive when there is nothing new to inject. Preserve unrelated headers and
payload bytes. Never mutate an offline command or persist transport metadata.

## Measure the boundary that actually exists

| Boundary        | Owned completion, not an inferred guarantee                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| HTTP client     | Document whether response headers, consumed body, logical call with retries, or one network attempt.              |
| HTTP server     | Response finish/close may precede worker completion.                                                              |
| Rabbit publish  | Synchronous publish is not broker confirmation; measure a confirmation Promise only if one already exists.        |
| Rabbit delivery | Manual settlement follows existing ack/nack ownership; a no-ack void handler only proves synchronous dispatch.    |
| Socket command  | Dispatch, first acknowledgment and terminal result are distinct; define which responses settle an attempt/bundle. |

Do not await/observe a callback's incidental Promise or create a new rejection
contract merely for tracing. Preserve duplicate callbacks, retries, ack/nack and
error propagation. End telemetry exactly once; do not suppress business work.
Use bounded attempt spans, not a socket/session-long span. Correlate retries with
validated attempt context, or a reviewed link when starting a fresh trace; legacy
ambiguous responses must not silently close a newer attempt. Detached work may
outlive its parent; collector tail-sampling/retention must account for late spans.

## Trust and privacy review

Inject only toward trusted initial API origins under an explicit boundary policy,
not all requests or a domain-suffix wildcard. The accepted Lynx browser policy is
**initial-destination-only**: preserve normal redirects even when the browser
forwards `traceparent` and optional `tracestate` to another service. This is not
redirect-safe propagation. The decision is accepted; regression coverage of this
boundary remains pending. This documentation records the tradeoff, not a code fix.
Local HTTP span coverage does not imply outbound propagation. Exclude collector
traffic from instrumentation to avoid recursion; final export privacy still applies.

The approved transport policy permits W3C trace context only, not baggage or
sensitive application data. Configure the application's transport propagator as
trace-context-only and test the actual outgoing headers. The current Lynx browser
bootstrap registers a composite including `W3CBaggagePropagator`; the generic
`propagation.inject` example above follows that global configuration. Neither this
guide nor accepting redirect forwarding proves the current setup excludes baggage.
Configuration alignment and regression validation remain follow-up work, not changes
made by this documentation correction.

Prefer fixed operation names and bounded structural fields: approved method/status,
safe route templates, fixed outcome enums and bounded counts. Do not use URLs,
queries, headers, payloads, credentials, tenant/business IDs, raw errors or dynamic
names as telemetry. Review resource and instrumentation-scope metadata too.
The helper records raw exceptions, so enforce application policy at final export;
also avoid verbose SDK diagnostics around sensitive configuration.

Existing export filters may erase new span names, attributes, events or links.
Any new allowed field/name/link needs an explicit policy change, privacy review
and serialized-export regression test. Do not promise correlation UI behavior
when links are dropped or related traces are unsampled/unretained. Transport trust
and baggage policy are application decisions, not global facade guarantees.
