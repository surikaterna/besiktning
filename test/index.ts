import chai from 'chai';
import * as besiktning from '../src';

const should = chai.should();

describe('index', function () {
  it('should contain intended exports', function () {
    should.exist(besiktning.withGauge);
    should.exist(besiktning.withTimer);
    should.exist(besiktning.withMeter);
    should.exist(besiktning.withExceptionMeter);
    should.exist(besiktning.Collector);
    should.exist(besiktning.telegrafFactory);
  });
});
