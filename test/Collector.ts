import chai from 'chai';
import sinon from 'sinon';
import Collector from '../src/Collector';
import { MeasurementPayload, EvaluatedMeasurementPayload, MeasurementCollector } from '../src/types';

const should = chai.should();

let evaluated = {};

describe('Collector', function () {
  beforeEach(function () {
    global.__besiktning.collect = undefined;
    sinon.restore();
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
      fields: {
        'first.2.third': true
      },
      instrument: 'test',
      target: 'test'
    };
    evaluated.should.eql(expectedPayload);
  });

  it('should not crash on error', function () {
    Collector.set(() => {
      throw new Error('Collector crashed');
    });
    const payload = {
      measurement: 'err_measurement',
      key: 'err_key',
      value: false,
      instrument: 'test_instrument',
      target: 'test_target'
    };
    sinon.replace(
      console,
      'error',
      sinon.fake(function (...messages: any): void {})
    );
    Collector.get()?.bind(null, payload, []).should.not.throw();
  });

  it('should log error on failure', function () {
    Collector.set(() => {
      throw new Error('Collector crashed');
    });
    sinon.replace(
      console,
      'error',
      sinon.fake(function (err: Error): void {
        errorsSentToStderr.push(err);
      })
    );
    const errorsSentToStderr: Error[] = [];
    const payload = {
      measurement: 'err_measurement',
      key: 'err_key',
      value: false,
      instrument: 'payload.instrument',
      target: 'payload.target'
    };
    Collector.get()?.call(null, payload, []);
    const messages = errorsSentToStderr.map(err => err?.message ?? err);
    const expectedMessages = ['Collector crashed', 'Failed to collect metrics from "payload.target" with "payload.instrument"'];
    messages.should.eql(expectedMessages);
  });
});
