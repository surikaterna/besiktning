import { LoggerFactory } from 'slf';
import { expect } from 'chai';
import Collector from '../src/Collector';
import { MeasurementPayload } from '../src/types';

let logMessages: string[] = [];
let evaluated = {};

describe('Collector', function () {
  beforeEach(function () {
    global.__besiktning.collect = undefined;
    logMessages = [];
  });

  afterEach(function () {
    LoggerFactory.setFactory(null);
  });

  it('should set collector function', function () {
    Collector.set(() => {});
    const globalCollect = global?.__besiktning?.collect;
    expect(globalCollect).to.exist;
    expect(globalCollect).to.be.a('function');
  });

  it('should get collector function', function () {
    Collector.set(() => {});
    const collect = Collector.get();
    const globalCollect = global?.__besiktning?.collect;
    expect(globalCollect).to.exist;
    expect(globalCollect).to.equal(collect);
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
    expect(evaluated).to.deep.equal(expectedPayload);
  });

  it('should not crash on measurement callback error', function () {
    Collector.set(() => {});
    const payload = {
      measurement: () => {
        throw new Error('`measurement` callback error');
      },
      key: 'err_key',
      value: false,
      instrument: 'test_instrument',
      target: 'test_target'
    };
    expect(Collector.get()?.bind(null, payload, [])).to.not.throw();
  });

  it('should not crash on key callback error', function () {
    Collector.set(() => {});
    const payload = {
      measurement: 'err_measurement',
      key: () => {
        throw new Error('`key` callback error');
      },
      value: false,
      instrument: 'test_instrument',
      target: 'test_target'
    };
    expect(Collector.get()?.bind(null, payload, [])).to.not.throw();
  });

  it('should not crash on tags callback error', function () {
    Collector.set(() => {});
    const payload = {
      measurement: 'err_measurement',
      key: 'err_key',
      tags: () => {
        throw new Error('`tags` callback error');
      },
      value: false,
      instrument: 'test_instrument',
      target: 'test_target'
    };
    expect(Collector.get()?.bind(null, payload, [])).to.not.throw();
  });

  it('should not crash on apply callback error', function () {
    Collector.set(() => {});
    const payload = {
      measurement: 'err_measurement',
      key: 'err_key',
      apply: () => {
        throw new Error('`apply` callback error');
      },
      value: false,
      instrument: 'test_instrument',
      target: 'test_target'
    };
    expect(Collector.get()?.bind(null, payload, [])).to.not.throw();
  });

  it('should not crash on collector error', function () {
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
    expect(Collector.get()?.bind(null, payload, [])).to.not.throw();
  });

  it('should log error on failure', function () {
    const logEvents: Array<{ level: string; params: unknown[] }> = [];
    LoggerFactory.setFactory((...events: Array<{ level: string; params: unknown[] }>) => {
      logEvents.push(...events);
    });

    Collector.set(() => {
      throw new Error('Collector crashed');
    });
    const payload = {
      measurement: 'err_measurement',
      key: 'err_key',
      value: false,
      instrument: 'payload.instrument',
      target: 'payload.target'
    };
    Collector.get()?.call(null, payload, []);

    logMessages = logEvents
      .filter(event => event.level === 'error')
      .map(event => {
        const err = event.params[0];
        if (err instanceof Error) {
          return err.message;
        }
        return `${err ?? ''}`;
      });

    const expectedMessages = ['Collector crashed', 'Failed to collect metrics from "payload.target" with "payload.instrument"'];
    expect(logMessages).to.deep.equal(expectedMessages);
  });
});
