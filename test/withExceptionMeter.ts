import chai from 'chai';
import sinon from 'sinon';
import Collector from '../src/Collector';
import { withExceptionMeter } from '../src/decorators';
import { FieldValue } from '../src/types';

const should = chai.should();

let exceptionMarks: FieldValue[] = [];

describe('@withExceptionMeter', function () {
  before(function () {
    Collector.set(({ fields }) => exceptionMarks.push(...Object.values(fields)));
  });

  beforeEach(function () {
    exceptionMarks = [];
    sinon.restore();
  });

  it('should count number of rejected `Promise`s', async function () {
    class Test {
      @withExceptionMeter({
        measurement: 'with_exception_meter',
        key: 'rejection'
      })
      rejectIfTrue(bool: boolean): Promise<void> {
        return bool ? Promise.reject(new Error()) : Promise.resolve();
      }
    }
    const test = new Test();
    let rejectionCount = 0;
    const bools = [true, false, false, true];
    for (let bool of bools) {
      try {
        await test.rejectIfTrue(bool);
      } catch (_) {
        rejectionCount++;
      }
    }
    exceptionMarks.length.should.equal(rejectionCount);
  });

  it('should count number of thrown exceptions', function () {
    class Test {
      @withExceptionMeter({
        measurement: 'with_exception_meter',
        key: 'exception',
        apply: () => 1
      })
      throwExceptionIfTrue(bool: boolean): void {
        if (bool) {
          throw new Error();
        }
      }
    }
    const test = new Test();
    let exceptionCount = 0;
    const bools = [true, false, false, true, true];
    for (let bool of bools) {
      try {
        test.throwExceptionIfTrue(bool);
      } catch (_) {
        exceptionCount++;
      }
    }
    const markCount = (exceptionMarks as number[]).reduce((sum: number, num: number) => sum + num, 0);
    markCount.should.equal(exceptionCount);
  });

  it('should propagate metered exception', async function () {
    const messages: string[] = [];
    class Test {
      @withExceptionMeter({
        measurement: 'with_exception_meter',
        key: 'exception',
        apply: () => 1
      })
      throwException(msg: string): never {
        throw new Error(msg);
      }
    }
    const test = new Test();
    await Promise.resolve()
      .then(() => test.throwException('Test1'))
      .then(() => {})
      .catch(err => messages.push(err.message))
      .then(() => messages.push('Not an error'))
      .then(() => test.throwException('Test2'))
      .then(() => {})
      .then(() => {})
      .catch(err => messages.push(err.message));
    [exceptionMarks.length, ...messages].should.eql([2, 'Test1', 'Not an error', 'Test2']);
  });

  it('should work with synchronous functions', function () {
    const meteredExceptionThrower = withExceptionMeter({
      measurement: 'with_exception_meter',
      key: 'count',
      apply: () => 1
    })((bool: boolean) => {
      if (bool) {
        throw new Error();
      }
    });
    let exceptionCount = 0;
    for (let bool of [true, false, false, true, false]) {
      try {
        meteredExceptionThrower(bool);
      } catch (_) {
        exceptionCount++;
      }
    }
    exceptionMarks.length.should.equal(exceptionCount);
  });

  it('should work with asynchronous functions', async function () {
    const meteredReject = withExceptionMeter({
      measurement: 'with_exception_meter',
      key: 'count',
      apply: () => 1
    })((ms: number): Promise<number> => new Promise((_, reject) => setTimeout(() => reject(new Error('metered')), ms)));
    let rejectionCount = 0;
    try {
      await meteredReject(10);
      await Promise.reject(new Error('not metered'));
      await meteredReject(30);
      await meteredReject(20);
      await Promise.reject();
    } catch (err) {
      if (err.message === 'metered') {
        rejectionCount++;
      }
    }
    exceptionMarks.length.should.equal(rejectionCount);
  });

  it("should propagate target's error when collector crashes", function () {
    const targetErr = new Error('Target crashed');
    const collectorErr = new Error('Collector crashed');
    Collector.set(() => {
      throw collectorErr;
    });
    class Test {
      @withExceptionMeter({
        measurement: 'collector_err',
        key: 'err_count'
      })
      fail(): never {
        throw targetErr;
      }
    }
    const test = new Test();
    sinon.replace(
      console,
      'error',
      sinon.fake(function (...messages: any): void {})
    );
    test.fail.should.throw(targetErr);
  });
});
