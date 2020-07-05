import chai from 'chai';
import { Measured, ExceptionMetered } from '@/decorators';

const should = chai.should();

describe('@ExceptionMetered', function () {
  it('should count number of rejected `Promise`s', async function () {
    let rejectionCount = 0;
    @Measured(() => {
      rejectionCount++;
    })
    class Test {
      @ExceptionMetered({
        measurement: 'exception_metered',
        key: 'rejection'
      })
      rejectIfTrue(bool: boolean): Promise<void> {
        return bool ? Promise.reject(new Error()) : Promise.resolve();
      }
    }
    const testInstance = new Test();
    const expectedRejectionCount = 2;
    const bools = [true, false, false, true];
    for (let bool of bools) {
      try {
        await testInstance.rejectIfTrue(bool);
      } catch (_) {}
    }
    rejectionCount.should.be.equal(expectedRejectionCount);
  });

  it('should count number of thrown exceptions', function () {
    let exceptionCount: number = 0;
    @Measured(({ key, value: count }) => {
      if (key === 'exception') {
        exceptionCount += count as number;
      }
    })
    class Test {
      @ExceptionMetered({
        measurement: 'exception_metered',
        key: 'exception',
        endomorphism: value => 1
      })
      throwExceptionIfTrue(bool: boolean): void {
        if (bool) {
          throw new Error();
        }
      }
    }
    const testInstance = new Test();
    const expectedExceptionCount = 3;
    const bools = [true, false, false, true, true];
    for (let bool of bools) {
      try {
        testInstance.throwExceptionIfTrue(bool);
      } catch (_) {}
    }
    exceptionCount.should.be.equal(expectedExceptionCount);
  });

  it('should propagate metered exception', async function () {
    const messages: string[] = [];
    let exceptionCount = 0;
    @Measured(({ key, value: count }) => {
      if (key === 'exception') {
        exceptionCount += count as number;
      }
    })
    class Test {
      @ExceptionMetered({
        measurement: 'exception_metered',
        key: 'exception',
        endomorphism: value => 1
      })
      throwException(msg: string): never {
        throw new Error(msg);
      }
    }
    const testInstance = new Test();
    await Promise.resolve()
      .then(() => testInstance.throwException('Test1'))
      .then(() => {})
      .catch(err => messages.push(err.message))
      .then(() => messages.push('Not an error'))
      .then(() => testInstance.throwException('Test2'))
      .then(() => {})
      .then(() => {})
      .catch(err => messages.push(err.message));
    [exceptionCount, ...messages].should.be.eql([2, 'Test1', 'Not an error', 'Test2']);
  })
});
