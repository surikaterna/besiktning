import chai from 'chai';
import { createDecorator } from '../src/decorators';
import { FieldCollector } from '../src/types';

const should = chai.should();

const mockInstrument = function <F extends (...args: any) => any>(collect: FieldCollector, func: F): ReturnType<F> {
  collect(0);
  return func();
};
const withMock = createDecorator(mockInstrument);

describe('decorators', function () {
  describe('createDecorator', function () {
    it('should preserve `this`', function () {
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
