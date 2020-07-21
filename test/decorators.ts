import chai from 'chai';
import { createDecorator } from '../src/decorators';
import Collector from '../src/Collector';
import { FieldCollector, EvaluatedMeasurementPayload } from '../src/types';

const should = chai.should();

function mockInstrument<F extends (...args: any) => any>(collect: FieldCollector, func: F): ReturnType<F> {
  collect(0);
  return func();
}
const withMock = createDecorator(mockInstrument);

function mockCollector(payload: EvaluatedMeasurementPayload): void {}

describe('decorators', function () {
  describe('createDecorator', function () {
    it('should preserve `this`', function () {
      Collector.set(mockCollector);
      class Test {
        @withMock({
          measurement: 'mock',
          key: 'none'
        })
        isThis() {
          return this instanceof Test;
        }
      }
      const test = new Test();
      test.isThis().should.be.true;
    });
  });
});
