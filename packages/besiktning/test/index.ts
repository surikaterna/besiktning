import { expect } from 'chai';
import * as besiktning from '../src';

describe('index', function () {
  it('should contain intended exports', function () {
    expect(besiktning.withGauge).to.exist;
    expect(besiktning.withTimer).to.exist;
    expect(besiktning.withMeter).to.exist;
    expect(besiktning.withExceptionMeter).to.exist;
    expect(besiktning.Collector).to.exist;
    expect(besiktning.telegrafFactory).to.exist;
  });
});
