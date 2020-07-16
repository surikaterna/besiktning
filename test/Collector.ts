import chai from 'chai';
import Collector from '../src/Collector';
import { MeasurementPayload, EvaluatedMeasurementPayload, MeasurementCollector } from '../src/types';

const should = chai.should();

let evaluated = {};

describe('Collector', function () {
  beforeEach(function () {
    global.__besiktning.collect = undefined;
  });

  it('should set collector function', function () {
    Collector.set(payload => {});
    const globalCollect = global?.__besiktning?.collect;
    should.exist(globalCollect);
    globalCollect?.should.be.a('function');
  });

  it('should get collector function', function () {
    Collector.set(payload => {});
    const collect = Collector.get();
    const globalCollect = global?.__besiktning?.collect;
    should.exist(globalCollect);
    globalCollect?.should.eql(collect);
  });

  it('should evaluate measurement payload', function () {
    Collector.set(payload => {
      evaluated = payload;
    });
    const payload: MeasurementPayload = {
      measurement: (arg1: string, arg2: number) => `${arg1}-${arg2}`,
      tags: (arg1: string, arg2: number) => ({
        arg1: arg1,
        arg2: `${arg2}`
      }),
      key: (...args: any[]) => args.join('.'),
      value: false,
      apply: val => !(val as boolean),
      instrument: 'test',
      target: 'test'
    };
    const args = ['first', 2, 'third'];
    Collector.get()?.call(null, payload, args);
    const expectedPayload = {
      measurement: 'first-2',
      tags: {
        arg1: 'first',
        arg2: '2'
      },
      key: 'first.2.third',
      value: true,
      instrument: 'test',
      target: 'test'
    };
    evaluated.should.eql(expectedPayload);
  });
});
