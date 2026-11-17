import { expect } from 'chai';
import sinon from 'sinon';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { context, createTracing, SpanStatusCode, trace, withOperation } from '../src/tracing';
import type { OperationOutcome, Span } from '../src/tracing';

describe('privacy-safe operation lifecycle', function () {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let span: Span;
  let end: sinon.SinonSpy;
  let tracing: ReturnType<typeof createTracing>;

  beforeEach(function () {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    trace.setGlobalTracerProvider(provider);
    tracing = createTracing('operations');
  });
  afterEach(async function () {
    context.disable();
    trace.disable();
    sinon.restore();
    await provider.shutdown();
  });

  function capture(): void {
    span = trace.getActiveSpan()!;
    expect(span).not.to.equal(undefined);
    end = sinon.spy(span, 'end');
  }

  function finished(outcome?: OperationOutcome): void {
    expect(end.callCount).to.equal(1);
    const recorded = exporter.getFinishedSpans();
    expect(recorded).to.have.length(1);
    expect(recorded[0]!.attributes).to.deep.equal(outcome ? { 'operation.outcome': outcome } : {});
    expect(recorded[0]!.status).to.deep.equal({ code: outcome === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.UNSET });
    expect(recorded[0]!.events).to.deep.equal([]);
  }

  it('invokes work immediately under the active span and preserves sync object identity without guessing', function () {
    const value = { valid: false, success: false, status: 'error' };
    expect(
      withOperation(tracing.tracer, 'sync', () => {
        capture();
        return value;
      })
    ).to.equal(value);
    finished();
    expect(trace.getActiveSpan()).to.equal(undefined);
  });

  for (const outcome of ['success', 'failure', 'error', 'cancelled'] as const) {
    it(`classifies a fulfilled value as ${outcome} before ending`, function () {
      const value = {};
      const classify = sinon.spy((actual: object) => {
        expect(actual).to.equal(value);
        expect(end.callCount).to.equal(0);
        return outcome;
      });
      expect(
        tracing.withOperation(
          'classified',
          () => {
            capture();
            return value;
          },
          classify
        )
      ).to.equal(value);
      expect(classify.callCount).to.equal(1);
      finished(outcome);
    });
  }

  it('waits for actual resolution and classifies the resolved object once', async function () {
    let resolve!: (value: object) => void;
    const value = {};
    const classify = sinon.spy(() => 'failure' as const);
    const pending = tracing.withOperation(
      'deferred',
      () => {
        capture();
        return new Promise<object>((done) => {
          resolve = done;
        });
      },
      classify
    );
    expect(end.callCount).to.equal(0);
    expect(classify.callCount).to.equal(0);
    resolve(value);
    expect(await pending).to.equal(value);
    expect(classify.calledOnceWithExactly(value)).to.equal(true);
    finished('failure');
  });

  for (const asynchronous of [false, true]) {
    it(`preserves opaque ${asynchronous ? 'rejection' : 'throw'} without inspecting or serializing it`, async function () {
      const reason = new Proxy(
        {},
        {
          get() {
            throw new Error('must not inspect');
          }
        }
      );
      const classify = sinon.spy();
      const run = () =>
        tracing.withOperation(
          'opaque',
          () => {
            capture();
            if (asynchronous) return Promise.reject(reason);
            throw reason;
          },
          classify
        );
      if (!asynchronous) {
        let caught: unknown;
        try {
          run();
        } catch (actual) {
          caught = actual;
        }
        expect(caught === reason).to.equal(true);
      } else {
        const caught = await run().then(
          () => ({ actual: undefined }),
          (actual: unknown) => ({ actual })
        );
        expect(caught.actual === reason).to.equal(true);
      }
      expect(classify.callCount).to.equal(0);
      finished('error');
    });
  }

  it('waits past a cancellation request until rejection, then applies explicit cancellation policy', async function () {
    const controller = new AbortController();
    const reason = new Error('private cancellation message');
    let reject!: (reason: unknown) => void;
    const classifyError = sinon.spy((actual: unknown) => {
      expect(actual).to.equal(reason);
      expect(end.callCount).to.equal(0);
      return controller.signal.aborted ? ('cancelled' as const) : ('error' as const);
    });
    const pending = tracing.withOperation(
      'cancel',
      () => {
        capture();
        return new Promise<never>((_, fail) => {
          reject = fail;
        });
      },
      undefined,
      { classifyError }
    );
    controller.abort();
    expect(end.callCount).to.equal(0);
    expect(classifyError.callCount).to.equal(0);
    reject(reason);
    expect(await pending.catch((actual: unknown) => actual)).to.equal(reason);
    expect(classifyError.callCount).to.equal(1);
    finished('cancelled');
  });

  for (const invalid of [
    undefined,
    'arbitrary-private-label',
    {
      toString() {
        throw new Error('no coercion');
      }
    }
  ]) {
    it('filters invalid classifier values without coercion', function () {
      const classify = (() => invalid) as () => OperationOutcome;
      expect(
        tracing.withOperation(
          'invalid',
          () => {
            capture();
            return 42;
          },
          classify
        )
      ).to.equal(42);
      finished();
    });
  }

  it('omits outcome when result classification throws and preserves the business result', function () {
    const value = {};
    expect(
      tracing.withOperation(
        'classifier-throw',
        () => {
          capture();
          return value;
        },
        () => {
          throw new Error('private classifier data');
        }
      )
    ).to.equal(value);
    finished();
  });

  for (const classifyError of [
    () => {
      throw new Error('private');
    },
    (() => 'success') as () => 'error'
  ]) {
    it('defaults broken error classifiers to error without replacing the original reason', async function () {
      const reason = 'private business reason';
      const pending = tracing.withOperation(
        'broken-error-classifier',
        () => {
          capture();
          return Promise.reject(reason);
        },
        undefined,
        { classifyError }
      );
      expect(await pending.catch((actual: unknown) => actual)).to.equal(reason);
      finished('error');
    });
  }

  it('assimilates an accessor thenable once with its original receiver and ignores later settlements', async function () {
    let reads = 0;
    const value = {};
    const thenable = {
      get then() {
        reads++;
        return function (this: unknown, resolve: (value: object) => void, reject: (reason: unknown) => void) {
          expect(this).to.equal(thenable);
          resolve(value);
          reject('ignored');
          throw new Error('ignored after settlement');
        };
      }
    };
    const classify = sinon.spy(() => 'success' as const);
    const pending = tracing.withOperation(
      'thenable',
      () => {
        capture();
        return thenable;
      },
      classify
    );
    expect(reads).to.equal(1);
    expect(end.callCount).to.equal(0);
    expect(await pending).to.equal(value);
    expect(reads).to.equal(1);
    expect(classify.callCount).to.equal(1);
    finished('success');
  });

  it('preserves a throwing then getter synchronously and ends once', function () {
    const reason = {};
    let caught: unknown;
    try {
      tracing.withOperation('getter', () => {
        capture();
        return {
          get then() {
            throw reason;
          }
        };
      });
    } catch (actual) {
      caught = actual;
    }
    expect(caught).to.equal(reason);
    finished('error');
  });

  for (const rejects of [false, true]) {
    it('does not replace business settlement when annotation or end throws', async function () {
      const value = {};
      const pending = tracing.withOperation(
        'hostile-span',
        () => {
          capture();
          sinon.stub(span, 'setAttribute').throws('attribute');
          sinon.stub(span, 'setStatus').throws('status');
          end.restore();
          end = sinon.stub(span, 'end').throws('end');
          return rejects ? Promise.reject(value) : Promise.resolve(value);
        },
        () => 'error'
      );
      const settled = await pending.then(
        (actual) => ({ actual, rejected: false }),
        (actual: unknown) => ({ actual, rejected: true })
      );
      expect(settled.actual).to.equal(value);
      expect(settled.rejected).to.equal(rejects);
      expect(end.callCount).to.equal(1);
    });
  }
});

describe('operation without an SDK', function () {
  it('supports sync and async work without installing a provider or manager', async function () {
    const { withOperation } = createTracing('noop');
    expect(withOperation('sync', () => 42)).to.equal(42);
    const value = {};
    expect(await withOperation('async', async () => value)).to.equal(value);
    expect(trace.getActiveSpan()).to.equal(undefined);
  });
});
