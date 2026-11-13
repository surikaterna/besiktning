import { expect } from 'chai';
import sinon from 'sinon';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { context, createTracing, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '../src/tracing';

describe('bound tracing factory', function () {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(function () {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  });

  afterEach(async function () {
    context.disable();
    trace.disable();
    await provider.shutdown();
    exporter.reset();
    sinon.restore();
  });

  it('returns the native tracer, forwards scope/version and works before and after provider registration', async function () {
    const getTracer = sinon.spy(trace, 'getTracer');
    const { tracer, withActiveSpan } = createTracing('lx.commands', '2.0');
    expect(getTracer.calledOnceWithExactly('lx.commands', '2.0')).to.equal(true);
    expect(tracer).to.equal(getTracer.firstCall.returnValue);
    expect(withActiveSpan('noop', (span) => span.isRecording())).to.equal(false);
    expect(await withActiveSpan('noop.async', async () => 42)).to.equal(42);
    expect(trace.setGlobalTracerProvider(provider)).to.equal(true);
    expect(withActiveSpan('registered', (span) => span.isRecording())).to.equal(true);
    const manual = tracer.startSpan('native');
    manual.end();
    expect(exporter.getFinishedSpans().map((span) => span.instrumentationScope)).to.deep.equal([
      { name: 'lx.commands', version: '2.0', schemaUrl: undefined },
      { name: 'lx.commands', version: '2.0', schemaUrl: undefined }
    ]);
  });

  it('supports omitted version and forwards exact native options and explicit context', function () {
    trace.setGlobalTracerProvider(provider);
    const { tracer, withActiveSpan } = createTracing('options');
    const start = sinon.spy(tracer, 'startActiveSpan');
    const options = { kind: SpanKind.CLIENT, attributes: { operation: 'submit' }, root: true };
    expect(withActiveSpan('forwarded', () => 17, options, ROOT_CONTEXT)).to.equal(17);
    expect(start.firstCall.args[1]).to.equal(options);
    expect(start.firstCall.args[2]).to.equal(ROOT_CONTEXT);
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.instrumentationScope.name).to.equal('options');
    expect(span.instrumentationScope.version).to.equal(undefined);
    expect(span.kind).to.equal(SpanKind.CLIENT);
    expect(span.attributes).to.deep.equal(options.attributes);
  });

  it('preserves nested async parents, explicit parents, links and new roots', async function () {
    trace.setGlobalTracerProvider(provider);
    const { withActiveSpan } = createTracing('parents');
    await withActiveSpan('outer', async (outer) => {
      const captured = context.active();
      await Promise.resolve();
      withActiveSpan('child', (child) => expect(trace.getActiveSpan()).to.equal(child));
      withActiveSpan(
        'root',
        () => {
          withActiveSpan('explicit-child', () => 1, {}, captured);
        },
        { links: [{ context: outer.spanContext(), attributes: { previous: true } }] },
        ROOT_CONTEXT
      );
      withActiveSpan('option-root', () => 1, { root: true });
      expect(trace.getActiveSpan()).to.equal(outer);
    });
    const spans = exporter.getFinishedSpans();
    const outer = spans.find((span) => span.name === 'outer')!;
    for (const name of ['child', 'explicit-child']) {
      expect(spans.find((span) => span.name === name)!.parentSpanContext!.spanId).to.equal(outer.spanContext().spanId);
    }
    for (const name of ['root', 'option-root']) {
      expect(spans.find((span) => span.name === name)!.parentSpanContext).to.equal(undefined);
    }
    expect(spans.find((span) => span.name === 'root')!.links).to.deep.equal([{ context: outer.spanContext(), attributes: { previous: true } }]);
  });

  it('retains error recording and owned lifetime for throws and rejections', async function () {
    trace.setGlobalTracerProvider(provider);
    const { withActiveSpan } = createTracing('failures');
    const error = new Error('cancelled');
    expect(() =>
      withActiveSpan('throw', () => {
        throw error;
      })
    ).to.throw(error);
    try {
      await withActiveSpan('reject', async () => {
        throw error;
      });
      expect.fail('expected rejection');
    } catch (actual) {
      expect(actual).to.equal(error);
    }
    expect(exporter.getFinishedSpans()).to.have.length(2);
    for (const span of exporter.getFinishedSpans()) {
      expect(span.status.code).to.equal(SpanStatusCode.ERROR);
      expect(span.events[0]!.attributes!['exception.message']).to.equal(error.message);
    }
  });
});
