import chai from 'chai';
import { Measured, Timed } from '@/decorators';

const should = chai.should();

describe('@Timed', function () {
  it('should time an asynchronous function', async function () {
    let measuredTime: number = 0;
    @Measured(({ value }) => {
      measuredTime += Number(value) / 10 ** 6;
    })
    class Test {
      @Timed({
        measurement: 'timed',
        key: 'waiting_time'
      })
      wait(ms: number) {
        return new Promise((resolve, reject) => setTimeout(() => resolve(), ms));
      }
    }
    const testInstance = new Test();
    const expectedTime = 1000;
    const errMargin = 20;
    this.timeout(0);
    await testInstance.wait(1000);
    measuredTime.should.be.above(expectedTime - errMargin).and.below(expectedTime + errMargin);
  });

  it('should time a synchronous function', function () {
    let measuredTime: number = 0;
    @Measured(({ value }) => {
      measuredTime += Number(value) / 10 ** 6;
    })
    class Test {
      @Timed({
        measurement: 'timed',
        key: 'waiting_time'
      })
      wait(ms: number) {
        const start = Date.now();
        while (Date.now() < start + ms) {}
      }
    }
    const testInstance = new Test();
    const expectedTime = 2000;
    const errMargin = 20;
    this.timeout(0);
    testInstance.wait(expectedTime);
    measuredTime.should.be.above(expectedTime - errMargin).and.below(expectedTime + errMargin);
  })

  it('should time a function in a `Promise` chain', async function () {
    let measuredTime: number = 0;
    @Measured(({ value }) => {
      measuredTime += Number(value) / 10 ** 6;
    })
    class Test {
      @Timed({
        measurement: 'timed',
        key: 'waiting_time'
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
    const testInstance = new Test();
    const expectedTime = 500;
    const errMargin = 20;
    this.timeout(0);
    await Promise.resolve()
      .then(() => testInstance.waitSync(expectedTime + 100))
      .then(() => testInstance.timedWait(expectedTime))
      .then(() => testInstance.waitSync(expectedTime - 100))
      .then(() => testInstance.timedWait(expectedTime))
      .then(() => testInstance.waitSync(expectedTime - 200));
    measuredTime.should.be
      .above(2 * expectedTime - errMargin)
      .and
      .below(2 * expectedTime + errMargin);
  });
});
