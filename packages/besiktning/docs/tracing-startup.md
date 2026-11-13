# Application-owned tracing startup

Use the native OpenTelemetry SDK, not another besiktning wrapper. The facade
provides instrumentation only; existing Telegraf/Influx metrics need no migration.

## Startup contract

1. Select mutually compatible API, SDK, context-manager, instrumentation and
   exporter releases for the runtime. The facade declares `@opentelemetry/api` as a
   `^1.9.1` peer dependency shared with the application; SDK packages are not runtime
   dependencies supplied by the facade. Do not infer compatibility from matching
   major numbers across OTel's stable/experimental packages.
2. Initialize one application-owned provider before business imports when native
   instrumentation patches dependencies. Bundled applications may need explicit
   transport instrumentation instead; avoid duplicate auto/manual spans.
3. Configure stable `service.name`, release `service.version`, and
   `deployment.environment.name`. None may contain tenant or request data.
4. Install a runtime-appropriate context manager and propagation policy. Node async
   hooks and browser context managers have different guarantees; see
   [explicit context carry](tracing-api.md#callbacks-events-and-browser-native-await).
5. Configure sampling, a bounded batch processor, exporter timeouts and shutdown
   flushing through the existing application lifecycle. Offline/full queues may
   drop telemetry, never block or reject business work. SIGKILL cannot flush.
6. Apply a tested final export privacy policy, including resources, names, events,
   links, scope metadata and status descriptions, not just span attributes.

Use standard OTLP exporter configuration supported by the **selected application
exporter**. `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is a complete traces URL;
`OTEL_EXPORTER_OTLP_ENDPOINT` is a base URL (HTTP exporters normally append
`/v1/traces`). HTTP/JSON, HTTP/protobuf and gRPC are different transports: a protocol
environment variable does not convert an explicitly selected exporter. Consult
the owning application's deployment guide for current endpoints and supported
settings; none is a facade default. Browser settings are public, never secrets,
and collector CORS must be configured operationally.

Use standard sampling/batch/disable settings only where the application actually
supports them. Environment labels describe resources, not FAT/POF-only execution
gates. Telemetry capacity/time limits must not become command allowlists or
business barriers. Initialization/export failure must leave business behavior intact.

For HMR and module federation, preserve the owning application's singleton across
remounts. Do not overwrite a host provider/context manager/propagator or shut down
global tracing on component unmount. Agree ownership with the host; `createTracing`
is not a provider singleton mechanism.

## Risk-based validation before delivery

-   Test no provider and late registration, sync return/throw, Promise fulfillment/
    rejection and cancellation policy. Check span end exactly once and original
    values/errors/callback order unchanged.
-   Test concurrent parents and context carry after native await/deferred callbacks;
    test HMR/federation registration conflicts where relevant.
-   Check transport header trust, malformed/missing context, stale `tracestate`
    cleanup, retries, disconnects and telemetry observation expiry/capacity limits.
    Prove metadata never reaches persisted domain objects.
-   Exercise actual serialized OTLP against a loopback receiver with seeded secrets:
    verify the allowlist, parentage, resources, sampling and allowed/removed links.
-   Check offline/hanging exporters, bounded queues, initialization failure, graceful
    termination signals and existing exit codes without changing business outcomes.
-   Check runtime/package exports, browser bundle isolation and compatibility using
    the real candidate artifact. After publication, separately validate a clean
    registry install with legitimate downstream manifests/locks; local artifacts
    are not release proof.
-   Keep local test/build evidence distinct from authenticated FAT/POF business-flow
    and live SigNoz ingestion/retention validation. Neither implies the other.

Run the owning project's required gates and obtain independent review. No secrets,
production fixtures or dependency installation into source are needed for reviewing
these generic guides.
