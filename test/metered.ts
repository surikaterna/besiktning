import chai from 'chai';
import { Measured, Metered } from '@/decorators';

const should = chai.should();

describe('@Metered', function () {
  it('should count number of invocations', async function () {
    let invocationCount = 0;
    @Measured(() => {
      invocationCount++;
    })
    class Test {
      @Metered({
        measurement: 'metered',
        key: 'invocation'
      })
      noop() {
        return Promise.resolve();
      }
      noopIgnored() {
        return Promise.resolve();
      }
    }
    const testInstance = new Test();
    const expectedInvocationCount = 3;
    const promises = [0, 1, 2, 3, 4, 5].map((num: number) => num % 2 === 0 ? testInstance.noopIgnored() : testInstance.noop());
    await Promise.all(promises);
    invocationCount.should.be.equal(expectedInvocationCount);
  });

  it('should work in `Promise` chain', async function () {
    let invocationCount = 0;
    @Measured(() => {
      invocationCount++;
    })
    class Test {
      @Metered({
        measurement: 'metered',
        key: 'invocation'
      })
      noop() {
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 10));
      }
      noopIgnored() {
        return Promise.resolve();
      }
    }
    const testInstance = new Test();
    const expectedInvocationCount = 2;
    await Promise.resolve()
      .then(() => testInstance.noop())
      .then(() => testInstance.noopIgnored())
      .then(() => testInstance.noop())
      .then(() => testInstance.noopIgnored())
      .then(() => testInstance.noopIgnored());
    invocationCount.should.be.equal(expectedInvocationCount);
  });

  it('should count number of invocations synchronously', function () {
    let [nextIndex, nextValue]: [number, number] = [0, 1];
    @Measured(({ value: count }) => {
      nextValue += count as number;
    })
    class Test {
      @Metered({
        measurement: 'geometric_progression',
        key: () => `iteration_${nextIndex++}`,
        apply: value => nextValue
      })
      noop(): void {}
      noopIgnored(): void {}
    }
    const testInstance = new Test();
    testInstance.noop();
    testInstance.noopIgnored();
    testInstance.noop();
    testInstance.noop();
    testInstance.noopIgnored();
    testInstance.noop();
    testInstance.noop();
    testInstance.noop();
    const expectedValue = 64;
    const expectedIndex = 6;
    [nextIndex, nextValue].should.be.eql([expectedIndex, expectedValue]);
  });
});
