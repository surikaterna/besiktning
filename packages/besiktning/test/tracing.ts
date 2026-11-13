import { expect } from 'chai';
import sinon from 'sinon';
import * as api from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { context, propagation, ROOT_CONTEXT, SpanStatusCode, trace, withActiveSpan } from '../src/tracing';

describe('tracing without an application provider', function () {
  it('uses the native API singleton and remains a no-op', async function () {
    expect(trace).to.equal(api.trace);
    expect(context).to.equal(api.context);
    expect(propagation).to.equal(api.propagation);
    const tracer = trace.getTracer('no-provider');
    expect(withActiveSpan(tracer, 'sync', (span) => span.isRecording())).to.equal(false);
    expect(await withActiveSpan(tracer, 'async', async () => 42)).to.equal(42);
    const error = new Error('no provider');
    expect(() =>
      withActiveSpan(tracer, 'throw', () => {
        throw error;
      })
    ).to.throw(error);
    try {
      await withActiveSpan(tracer, 'reject', () => Promise.reject(error));
      expect.fail('expected rejection');
    } catch (actual) {
      expect(actual).to.equal(error);
    }
  });
});

describe('application-owned tracing', function () {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const manager = new AsyncLocalStorageContextManager();
  const tracer = provider.getTracer('application');

  before(function () {
    expect(context.setGlobalContextManager(manager.enable())).to.equal(true);
    expect(trace.setGlobalTracerProvider(provider)).to.equal(true);
    expect(propagation.setGlobalPropagator(new W3CTraceContextPropagator())).to.equal(true);
  });

  afterEach(function () {
    exporter.reset();
  });
  after(async function () {
    context.disable();
    trace.disable();
    propagation.disable();
    await provider.shutdown();
  });

  it('preserves sync values and ends once without forcing success status', function () {
    const value = {};
    let end: sinon.SinonSpy;
    expect(
      withActiveSpan(tracer, 'sync', (span) => {
        end = sinon.spy(span, 'end');
        expect(trace.getActiveSpan()).to.equal(span);
        span.setAttribute('custom', true);
        return value;
      })
    ).to.equal(value);
    expect(end!.callCount).to.equal(1);
    expect(exporter.getFinishedSpans()[0]!.status.code).to.equal(SpanStatusCode.UNSET);
    expect(trace.getActiveSpan()).to.equal(undefined);
  });

  it('waits for async success and preserves its resolved value', async function () {
    let finish!: (value: object) => void;
    const value = {};
    let end!: sinon.SinonSpy;
    const pending = withActiveSpan(tracer, 'async', (span) => {
      end = sinon.spy(span, 'end');
      return new Promise<object>((resolve) => {
        finish = resolve;
      });
    });
    expect(end.callCount).to.equal(0);
    finish(value);
    expect(await pending).to.equal(value);
    expect(end.callCount).to.equal(1);
  });

  for (const asynchronous of [false, true]) {
    it(`preserves ${asynchronous ? 'async' : 'sync'} errors, records and ends once`, async function () {
      const error = new Error('operation failed');
      let end!: sinon.SinonSpy;
      const run = () =>
        withActiveSpan(tracer, 'failure', (span) => {
          end = sinon.spy(span, 'end');
          if (asynchronous) return Promise.reject(error);
          throw error;
        });
      try {
        await run();
        expect.fail('expected error');
      } catch (actual) {
        expect(actual).to.equal(error);
      }
      expect(end.callCount).to.equal(1);
      const finished = exporter.getFinishedSpans()[0]!;
      expect(finished.status.code).to.equal(SpanStatusCode.ERROR);
      expect(finished.events[0]!.attributes!['exception.message']).to.equal(error.message);
    });
  }

  it('preserves non-Error thrown values without fabricating exceptions', function () {
    const reason = { failure: true };
    try {
      withActiveSpan(tracer, 'unknown', () => {
        throw reason;
      });
      expect.fail('expected throw');
    } catch (actual) {
      expect(actual).to.equal(reason);
    }
    const finished = exporter.getFinishedSpans()[0]!;
    expect(finished.status.code).to.equal(SpanStatusCode.ERROR);
    expect(finished.events).to.have.length(0);
  });

  it('records string rejections and preserves caller-set success status', async function () {
    try {
      await withActiveSpan(tracer, 'string', () => Promise.reject('failed'));
      expect.fail('expected rejection');
    } catch (actual) {
      expect(actual).to.equal('failed');
    }
    expect(exporter.getFinishedSpans()[0]!.events[0]!.attributes!['exception.message']).to.equal('failed');
    expect(
      withActiveSpan(tracer, 'void', (span) => {
        span.setStatus({ code: SpanStatusCode.OK });
      })
    ).to.equal(undefined);
    expect(exporter.getFinishedSpans()[1]!.status.code).to.equal(SpanStatusCode.OK);
  });

  it('reads accessor thenables once and assimilates asynchronously with the original receiver', async function () {
    const makeThenable = () => ({
      reads: 0,
      calls: 0,
      get then() {
        const value = ++this.reads;
        return function (this: { calls: number }, resolve: (value: number) => void) {
          this.calls++;
          resolve(value);
        };
      }
    });
    const native = makeThenable();
    expect(await Promise.resolve(native)).to.equal(1);
    expect(native.reads).to.equal(1);
    const value = makeThenable();
    let end!: sinon.SinonSpy;
    const pending = withActiveSpan(tracer, 'accessor', (span) => {
      end = sinon.spy(span, 'end');
      return value;
    });
    expect(value.reads).to.equal(1);
    expect(value.calls).to.equal(0);
    expect(end.callCount).to.equal(0);
    expect(await pending).to.equal(1);
    expect(value.reads).to.equal(1);
    expect(value.calls).to.equal(1);
    expect(end.callCount).to.equal(1);
  });

  for (const callableShape of ['null prototype', 'shadowed call']) {
    for (const rejects of [false, true]) {
      it(`assimilates ${callableShape} then methods that ${rejects ? 'reject' : 'resolve'}`, async function () {
        const outcome = new Error('thenable outcome');
        let reads = 0;
        let calls = 0;
        const then = function (this: unknown, resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
          expect(this).to.equal(value);
          calls++;
          (rejects ? reject : resolve)(outcome);
          resolve('ignored settlement');
        };
        if (callableShape === 'null prototype') Object.setPrototypeOf(then, null);
        else Object.defineProperty(then, 'call', { value: null });
        const value = {
          get then() {
            reads++;
            return then;
          }
        };
        let end!: sinon.SinonSpy;
        const pending = withActiveSpan(tracer, 'unusual-callable', (span) => {
          end = sinon.spy(span, 'end');
          return value;
        });
        expect(reads).to.equal(1);
        expect(calls).to.equal(0);
        expect(end.callCount).to.equal(0);
        const settled = await Promise.resolve(pending).then(
          (result) => ({ rejected: false, result }),
          (result: unknown) => ({ rejected: true, result })
        );
        expect(settled).to.deep.equal({ rejected: rejects, result: outcome });
        expect(reads).to.equal(1);
        expect(calls).to.equal(1);
        expect(end.callCount).to.equal(1);
        expect(exporter.getFinishedSpans()[0]!.status.code).to.equal(rejects ? SpanStatusCode.ERROR : SpanStatusCode.UNSET);
      });
    }
  }

  it('preserves values with noncallable then properties and ends once', function () {
    let reads = 0;
    const value = {
      get then() {
        reads++;
        return 42;
      }
    };
    let end!: sinon.SinonSpy;
    expect(
      withActiveSpan(tracer, 'noncallable', (span) => {
        end = sinon.spy(span, 'end');
        return value;
      })
    ).to.equal(value);
    expect(reads).to.equal(1);
    expect(end.callCount).to.equal(1);
  });

  it('rejects throwing then methods, records failure and ends once', async function () {
    const error = new Error('then method');
    let end!: sinon.SinonSpy;
    const pending = withActiveSpan(tracer, 'then-throw', (span) => {
      end = sinon.spy(span, 'end');
      return {
        then() {
          throw error;
        }
      };
    });
    expect(end.callCount).to.equal(0);
    try {
      await pending;
      expect.fail('expected rejection');
    } catch (actual) {
      expect(actual).to.equal(error);
    }
    expect(end.callCount).to.equal(1);
    expect(exporter.getFinishedSpans()[0]!.status.code).to.equal(SpanStatusCode.ERROR);
  });

  it('assimilates thenables once and handles throwing then accessors', async function () {
    let calls = 0;
    let end!: sinon.SinonSpy;
    expect(
      await withActiveSpan(tracer, 'thenable', (span) => {
        end = sinon.spy(span, 'end');
        return {
          then(resolve: (value: number) => void) {
            calls++;
            resolve(7);
            resolve(8);
          }
        };
      })
    ).to.equal(7);
    expect(calls).to.equal(1);
    expect(end.callCount).to.equal(1);
    const error = new Error('then getter');
    expect(() =>
      withActiveSpan(tracer, 'getter', (span) => {
        end = sinon.spy(span, 'end');
        return {
          get then() {
            throw error;
          }
        };
      })
    ).to.throw(error);
    expect(end.callCount).to.equal(1);
    expect(exporter.getFinishedSpans()).to.have.length(2);
    expect(exporter.getFinishedSpans()[1]!.status.code).to.equal(SpanStatusCode.ERROR);
  });

  it('retains nested parents across awaits and isolates concurrent operations', async function () {
    await Promise.all(
      ['a', 'b'].map((name) =>
        withActiveSpan(tracer, name, async (parent) => {
          await Promise.resolve();
          expect(trace.getActiveSpan()).to.equal(parent);
          await withActiveSpan(tracer, `${name}.child`, async (child) => {
            await Promise.resolve();
            expect(trace.getActiveSpan()).to.equal(child);
          });
          expect(trace.getActiveSpan()).to.equal(parent);
        })
      )
    );
    const spans = exporter.getFinishedSpans();
    for (const name of ['a', 'b']) {
      const parent = spans.find((span) => span.name === name)!;
      const child = spans.find((span) => span.name === `${name}.child`)!;
      expect(child.parentSpanContext!.spanId).to.equal(parent.spanContext().spanId);
    }
    expect(trace.getActiveSpan()).to.equal(undefined);
  });

  it('supports explicit capture, binding, propagation and caller-owned lifecycle', function () {
    const parent = tracer.startSpan('manual');
    const captured = trace.setSpan(ROOT_CONTEXT, parent);
    const carrier: Record<string, string> = {};
    propagation.inject(captured, carrier);
    const extracted = propagation.extract(ROOT_CONTEXT, carrier);
    const receiver = { value: 12 };
    const bound = context.bind(captured, function (this: typeof receiver, n: number) {
      expect(trace.getActiveSpan()).to.equal(parent);
      return this.value + n;
    });
    expect(bound.call(receiver, 3)).to.equal(15);
    withActiveSpan(trace.getTracer('native-consumer'), 'remote-child', () => 1, { attributes: { explicit: true } }, extracted);
    expect(exporter.getFinishedSpans()).to.have.length(1);
    expect(exporter.getFinishedSpans()[0]!.parentSpanContext!.spanId).to.equal(parent.spanContext().spanId);
    expect(parent.isRecording()).to.equal(true);
    parent.end();
    expect(exporter.getFinishedSpans()).to.have.length(2);
  });
});
