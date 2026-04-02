import chai from 'chai';
import { isThenable } from '../src/util';

const should = chai.should();

describe('util', function () {
  describe('isThenable', function () {
    it('should return true, if argument is a `Promise`', function () {
      isThenable(Promise.resolve()).should.be.true;
    });

    it('should return true, if provided object has a `then`-method', function () {
      isThenable({ then: () => {} }).should.be.true;
    });

    it('should return false, if argument is not an object', function () {
      isThenable(() => {}).should.be.false;
    });

    it('should return false, if an object does not have a `then`-method', function () {
      isThenable({ them: () => {} }).should.be.false;
    });
  });
});
