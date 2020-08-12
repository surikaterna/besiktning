import chai from 'chai';
import Collector from '../src/Collector';
import { withTimer } from '../src/decorators';

const should = chai.should();

const ERROR_MARGIN = 20;
let measuredTime = 0;

function sum(nums: number[]): number {
  return nums.reduce((sum, num) => sum + num, 0);
}

describe('@withTimer', function () {
  before(function () {
    Collector.set(({ fields }) => {
      const value = sum(Object.values(fields).map(val => Number(val)));
      measuredTime += value / 10 ** 6;
    });
  });

  beforeEach(function () {
    measuredTime = 0;
  });

  it('should time an asynchronous method', async function () {
    class Test {
      @withTimer({
        measurement: 'with_timer',
        key: 'async_interval'
      })
      wait(ms: number) {
        return new Promise((resolve, reject) => setTimeout(() => resolve(), ms));
      }
    }
    const test = new Test();
    const expectedTime = 1000;
    this.timeout(0);
    await test.wait(1000);
    measuredTime.should.be.above(expectedTime - ERROR_MARGIN).and.below(expectedTime + ERROR_MARGIN);
  });

  it('should time a synchronous method', function () {
    class Test {
      @withTimer({
        measurement: 'with_timer',
        key: 'sync_interval'
      })
      wait(ms: number) {
        const start = Date.now();
        while (Date.now() < start + ms) {}
      }
    }
    const test = new Test();
    const expectedTime = 2000;
    this.timeout(0);
    test.wait(expectedTime);
    measuredTime.should.be.above(expectedTime - ERROR_MARGIN).and.below(expectedTime + ERROR_MARGIN);
  });

  it('should time a method in a `Promise` chain', async function () {
    class Test {
      @withTimer({
        measurement: 'with_timer',
        key: 'promise_interval'
      })
      timedWait(ms: number) {
        const start = Date.now();
        while (Date.now() < start + ms) {}
      }
      waitSync(ms: number) {
        const start = Date.now();
        while (Date.now() < start + ms) {}
      }
    }
    const test = new Test();
    const expectedTime = 500;
    this.timeout(0);
    await Promise.resolve()
      .then(() => test.waitSync(expectedTime + 100))
      .then(() => test.timedWait(expectedTime))
      .then(() => test.waitSync(expectedTime - 100))
      .then(() => test.timedWait(expectedTime))
      .then(() => test.waitSync(expectedTime - 200));
    measuredTime.should.be.above(2 * expectedTime - ERROR_MARGIN).and.below(2 * expectedTime + ERROR_MARGIN);
  });

  it('should work with synchronous functions', function () {
    const timedWait = withTimer({
      measurement: 'with_timer',
      key: 'anon_interval'
    })((ms: number) => {
      const start = Date.now();
      while (Date.now() < start + ms) {}
    });
    const expectedTime = 1000;
    timedWait(expectedTime);
    measuredTime.should.be.above(expectedTime - ERROR_MARGIN).and.below(expectedTime + ERROR_MARGIN);
  });

  it('should work with asynchronous functions', async function () {
    const wait = withTimer({
      measurement: 'with_timer',
      key: 'async_anon_interval'
    })((ms: number): Promise<number> => new Promise(resolve => setTimeout(() => resolve(ms), ms)));
    this.timeout(0);
    const intervals = await Promise.all([wait(1000), wait(2000), wait(3000)]);
    const expectedTime = intervals.reduce((sum: number, interval: number) => sum + interval, 0);
    measuredTime.should.be.above(expectedTime - ERROR_MARGIN).and.below(expectedTime + ERROR_MARGIN);
  });

  it('should ignore collector crash', function () {
    const collectorErr = new Error('Collector crashed');
    Collector.set(() => {
      throw collectorErr;
    });
    class Test {
      private _interval: number = 0;
      get interval(): number {
        return this._interval;
      }
      @withTimer({
        measurement: 'collector_err',
        key: 'interval'
      })
      wait(ms: number): void {
        const start = Date.now();
        while (Date.now() < start + ms) {}
        this._interval = Date.now() - start;
      }
    }
    const test = new Test();
    const interval = 1000;
    test.wait.bind(test, interval).should.not.throw();
    test.interval.should.be.above(interval - ERROR_MARGIN).and.below(interval + ERROR_MARGIN);
  });
});
