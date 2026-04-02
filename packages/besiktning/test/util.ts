import { expect } from 'chai';
import { isThenable } from '../src/util';

describe('util', function () {
  describe('isThenable', function () {
    it('should return true, if argument is a `Promise`', function () {
      expect(isThenable(Promise.resolve())).to.be.true;
    });

    it('should return true, if provided object has a `then`-method', function () {
      expect(isThenable({ then: () => {} })).to.be.true;
    });

    it('should return false, if argument is not an object', function () {
      expect(isThenable(() => {})).to.be.false;
    });

    it('should return false, if an object does not have a `then`-method', function () {
      expect(isThenable({ them: () => {} })).to.be.false;
    });
  });
});
