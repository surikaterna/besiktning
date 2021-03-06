import chai from 'chai';
import Collector from '../src/Collector';
import { withMeter } from '../src/decorators';

const should = chai.should();

let meter = 0;

describe('@withMeter', function () {
  beforeEach(function () {
    Collector.set(() => {
      meter++;
    });
    meter = 0;
  });

  it('should count number of method invocations', async function () {
    class Test {
      @withMeter({
        measurement: 'with_meter',
        key: 'invocation'
      })
      meteredNoop() {
        return Promise.resolve();
      }
      ignoredNoop() {
        return Promise.resolve();
      }
    }
    const test = new Test();
    const expectedInvocationCount = 3;
    const promises = [0, 1, 2, 3, 4, 5].map((num: number) => (num % 2 === 0 ? test.ignoredNoop() : test.meteredNoop()));
    await Promise.all(promises);
    meter.should.equal(expectedInvocationCount);
  });

  it('should work in `Promise` chain', async function () {
    class Test {
      @withMeter({
        measurement: 'with_meter',
        key: 'promise_invocation'
      })
      meteredNoop() {
        return new Promise(resolve => setTimeout(() => resolve(), 10));
      }
      ignoredNoop() {
        return Promise.resolve();
      }
    }
    const test = new Test();
    const expectedInvocationCount = 2;
    await Promise.resolve()
      .then(() => test.meteredNoop())
      .then(() => test.ignoredNoop())
      .then(() => test.meteredNoop())
      .then(() => test.ignoredNoop())
      .then(() => test.ignoredNoop());
    meter.should.equal(expectedInvocationCount);
  });

  it('should count number of method invocations synchronously', function () {
    let [nextIndex, nextValue]: [number, number] = [0, 1];
    Collector.set(({ fields }) => {
      const count = fields?.iteration ?? 0;
      nextValue += count as number;
      nextIndex++;
    });
    class Test {
      @withMeter({
        measurement: 'geometric_progression',
        key: 'iteration',
        apply: () => nextValue
      })
      meteredNoop(): void {}
      ignoredNoop(): void {}
    }
    const test = new Test();
    test.meteredNoop();
    test.ignoredNoop();
    test.meteredNoop();
    test.meteredNoop();
    test.ignoredNoop();
    test.meteredNoop();
    test.meteredNoop();
    test.meteredNoop();
    const expectedValue = 64;
    const expectedIndex = 6;
    [nextIndex, nextValue].should.eql([expectedIndex, expectedValue]);
  });

  it('should work with synchronous functions', function () {
    let expectedCount = 0;
    const meteredCounter = withMeter({
      measurement: 'with_meter',
      key: 'count'
    })(() => {
      expectedCount++;
    });
    meteredCounter();
    meteredCounter();
    meteredCounter();
    meter.should.equal(expectedCount);
  });

  it('should work with asynchronous functions', async function () {
    let resolvedCount = 0;
    const meteredCounter = withMeter({
      measurement: 'with_meter',
      key: 'async_count'
    })((): Promise<number> => new Promise(resolve => setTimeout(() => resolve(resolvedCount++), 100)));
    await Promise.all([meteredCounter(), meteredCounter(), meteredCounter()]);
    meter.should.equal(resolvedCount);
  });

  it('should ignore collector crash', function () {
    const collectorErr = new Error('Collector crashed');
    Collector.set(() => {
      throw collectorErr;
    });
    class Test {
      private _count: number = 0;
      get count(): number {
        return this._count;
      }
      @withMeter({
        measurement: 'collector_err',
        key: 'count'
      })
      increment(): number {
        return ++this._count;
      }
    }
    const test = new Test();
    const expectedCount = 1;
    test.increment.bind(test).should.not.throw().and.equal(expectedCount);
  });
});
