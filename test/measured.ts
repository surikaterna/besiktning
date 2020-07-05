import chai from 'chai';
import { Measured } from '@/decorators';

const should = chai.should();

describe('@Measured', function () {
  it('should decorate class with `_collect` field', function () {
    @Measured(() => {})
    class Test {}
    const testInstance = new Test();
    testInstance.should.have.property('_collect');
  });
});
