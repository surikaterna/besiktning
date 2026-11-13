const assert = require('node:assert/strict');
const { realpathSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const api = require('@opentelemetry/api');
const facade = require('besiktning/tracing');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');
const { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

function assertPeerResolution() {
  const manifest = require('besiktning/package.json');
  assert.equal(manifest.peerDependencies['@opentelemetry/api'], '^1.9.1');
  assert.equal(manifest.dependencies?.['@opentelemetry/api'], undefined);
  assert(!Object.keys(manifest.dependencies || {}).some((name) => name.startsWith('@opentelemetry/')));
  const hostPath = realpathSync(require.resolve('@opentelemetry/api'));
  for (const entry of ['besiktning/tracing', '@opentelemetry/sdk-trace-base', '@opentelemetry/context-async-hooks']) {
    const consumer = createRequire(realpathSync(require.resolve(entry)));
    assert.equal(realpathSync(consumer.resolve('@opentelemetry/api')), hostPath, `${entry}: physical API mismatch`);
  }
  assert.equal(require(path.resolve(path.dirname(hostPath), '../../package.json')).version, '1.9.1');
  for (const name of ['trace', 'context', 'propagation']) assert.equal(facade[name], api[name]);
  console.log('Packed peer: host, facade and SDK resolve the same physical API 1.9.1');
}

async function assertContextContinuity(exporter) {
  const { withActiveSpan } = facade.createTracing('packed-consumer');
  await Promise.all(
    ['a', 'b'].map((name) =>
      withActiveSpan(name, async (parent) => {
        assert(parent.isRecording());
        await Promise.resolve();
        assert.equal(api.trace.getActiveSpan(), parent);
        assert.equal(facade.context.active(), api.context.active());
        await withActiveSpan(`${name}.child`, async (child) => {
          await Promise.resolve();
          assert.equal(api.trace.getActiveSpan(), child);
          assert.equal(facade.trace.getActiveSpan(), child);
        });
        assert.equal(api.trace.getActiveSpan(), parent);
        const carrier = {};
        facade.propagation.inject(api.context.active(), carrier);
        const extracted = api.propagation.extract(api.ROOT_CONTEXT, carrier);
        assert.equal(api.trace.getSpanContext(extracted).spanId, parent.spanContext().spanId);
      })
    )
  );
  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 4);
  for (const name of ['a', 'b']) {
    const parent = spans.find((span) => span.name === name);
    const child = spans.find((span) => span.name === `${name}.child`);
    assert.equal(child.parentSpanContext.spanId, parent.spanContext().spanId);
    assert.equal(child.spanContext().traceId, parent.spanContext().traceId);
  }
  assert.equal(api.trace.getActiveSpan(), undefined);
}

async function main() {
  assertPeerResolution();
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const manager = new AsyncLocalStorageContextManager().enable();
  try {
    assert.equal(api.context.setGlobalContextManager(manager), true);
    assert.equal(api.trace.setGlobalTracerProvider(provider), true);
    assert.equal(api.propagation.setGlobalPropagator(new W3CTraceContextPropagator()), true);
    await assertContextContinuity(exporter);
    console.log('Packed host-owned provider, concurrent async context, parentage and propagation: PASS');
  } finally {
    api.context.disable();
    api.trace.disable();
    api.propagation.disable();
    manager.disable();
    await provider.shutdown();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
