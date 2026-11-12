# Lynx tracing: bounded coverage snapshot

As of this documentation review (2026-11-12), these are **local workstream
independently audited observations**, not merged/released fleet coverage or a whole-flow business audit. Generic
facade usage belongs in [the API guide](tracing-api.md). PR numbers identify the
owning repositories; downstream follow-ons include uncommitted local changes.

| Project / review            | Locally documented scope                                                                                                                             | Still outside that claim                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| besiktning PR 19, `bb96a23` | Native API exports, factory and explicit helper; no SDK bootstrap.                                                                                   | Candidate 0.4.0 publication and downstream clean-registry installation pending.                                                        |
| lx-api-server PR 7542       | App-owned Node SDK; native HTTP/MongoDB; socket dispatch and acknowledgment observations.                                                            | Acknowledgment is not durable/background completion; no universal Rabbit/persistence semantic spans.                                   |
| lx-react-client PR 16689    | Browser SDK, generic fetch/XHR; GMR status-chip operation; single/bundle socket attempts and retry correlation; audited real Chromium HTTP boundary. | Remaining semantic UI operations; host-owned instrumentation is host responsibility. Accepted initial-hop policy is not redirect-safe. |
| lx-tenant-api PR 3531       | Worker/execution/stages; HTTP adapter and Rabbit RPC; TO publication/delivery; generic HTTP stages/OAuth CLIENT spans.                               | No new outbound HTTP trace injection. STOMP/WebSocket and remaining outbound paths are not universally covered.                        |
| lynx3                       | Rabbit publisher and all consumers; 81-test full-suite result independently audited.                                                                 | Not universal transport coverage or deployed business-flow validation.                                                                 |

Local guides and independent audits describe tests/builds for these bounded slices;
this documentation refresh does not re-run them. TAPI ingress, RPC, pipeline stages,
outbound HTTP/OAuth and detached TO have been locally audited, including six
real-broker tests. The bounded local cross-socket integration has also passed independent
audit: two runs of three tests using actual Chromium, real Socket.IO and the actual
API route with separate provider contexts and authentication/business/DB stubs.
Authenticated business-flow and durable-DB integration remain
outside that claim. Neither local harness proves production coverage or whole-flow
business correctness. No authenticated live FAT/POF business-flow validation or live
SigNoz ingestion/navigation is claimed.

The accepted browser boundary restricts injection to trusted initial API origins
and preserves normal redirects, including possible forwarding of `traceparent`
and optional `tracestate` to other services. It does not permit baggage or sensitive
application data injection. The app-owned browser bootstrap now uses only
`W3CTraceContextPropagator`. Independent audit of actual Chromium fetch/XHR confirms
seeded baggage remains locally accessible but is never injected, direct third-party
requests receive no injected context, and collector exclusion/export privacy pass.
Host-owned globals remain untouched. See the
[transport policy](tracing-transports.md#trust-and-privacy-review); this is an
accepted tradeoff, not a redirect-safety claim or production-code fix.

This documentation is intended for the release candidate, not a release claim.
Earlier open PR heads still contain bootstrap-era scope; locally audited follow-ons
include dirty work not yet delivered to those branches. Shared whole-flow delivery
still requires manifest/dependency/lock updates, publication, clean-registry installs,
branch updates, independent documentation audit, and integrated/live FAT validation.
The user's release-candidate proposal is not approval to publish or merge.

## Source-of-truth guides

Read the corresponding PR revision of these repository-relative paths (not paths
inside the besiktning package):

-   `lx-api-server`: `mds/tracing.md` — launcher, HTTP/Mongo, socket lifetimes,
    exporter policy and release prerequisite.
-   `lx-react-client`: `src/modules/tracing/tracing.md` — browser ownership,
    native-await limitations, GMR/socket contracts and local validation boundaries.
-   `lx-tenant-api`: `apps/lx-tenant-api/TRACING.md` — execution, Rabbit, HTTP,
    no outbound HTTP propagation, privacy and launcher validation.

Those guides were read from each repository's `trees/tracing-otel` worktree.
Treat later edits as new evidence, not proof of completion of the shared initiative.
In particular, TAPI SequenceService/DataHub, adapter TO HTTP and streamFile resource
requests are outside its documented generic HTTP stage slice (shared token utility
coverage does not imply resource-call coverage).
