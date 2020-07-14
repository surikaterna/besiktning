import chai from 'chai';
import Collector from '../src/Collector';
import telegraf, { getInfluxLine, TelegrafPayload, parseUri } from '../src/collectors/telegraf';
import { withGauge } from '../src/decorators';

const should = chai.should();

function wait(s: number): void {
  const ms = s * 1000;
  const start = Date.now();
  while (Date.now() < start + ms) { }
}

function sum(a: number, b: number): number {
  return a + b;
}

describe('Telegraf integration', function () {
  describe('telegraf', function () {
    before(function () {
      Collector.set(telegraf);
    });

    it('should send data to Telegraf', function () {
      const gaugedAdder = withGauge({ measurement: 'besiktning', key: 'sum', tags: { tag: 'tag_value' } })(sum);
      gaugedAdder(1, 2);
    });
  });

  describe('getInfluxLine', function () {
    it('should correctly transform payload without tags and timestamp', function () {
      const payload: TelegrafPayload = {
        measurement: 'test',
        key: 'key',
        value: 'value'
      };
      const influxLine = getInfluxLine(payload);
      const expected = 'test key=value';
      influxLine.should.equal(expected);
    });

    it('should correctly transform payload without tags', function () {
      const timestamp: bigint = process.hrtime.bigint();
      const payload: TelegrafPayload = {
        measurement: 'test',
        key: 'key',
        value: 'value',
        timestamp
      };
      const influxLine = getInfluxLine(payload);
      const expected = `test key=value ${timestamp}`;
      influxLine.should.equal(expected);
    });

    it('should correctly transform payload without timestamp', function () {
      const payload: TelegrafPayload = {
        measurement: 'test',
        key: 'key',
        value: 'value',
        tags: {
          first: 'one',
          second: 'two'
        }
      };
      const influxLine = getInfluxLine(payload);
      const expected = 'test,first=one,second=two key=value';
      influxLine.should.equal(expected);
    });

    it('should correctly transform payload', function () {
      const timestamp: bigint = process.hrtime.bigint();
      const payload: TelegrafPayload = {
        measurement: 'test',
        key: 'key',
        value: 'value',
        tags: {
          first: 'one',
          second: 'two'
        },
        timestamp
      };
      const influxLine = getInfluxLine(payload);
      const expected = `test,first=one,second=two key=value ${timestamp}`;
      influxLine.should.equal(expected);
    });

    it('should not escape blank characters (caller must do it)', function () {
      const payload: TelegrafPayload = {
        measurement: 'test with blanks',
        key: 'key',
        value: 'v a l u e'
      };
      const influxLine = getInfluxLine(payload);
      const expected = 'test with blanks key=v a l u e';
      influxLine.should.equal(expected);
    });
  });

  describe('parseUri', function () {
    it('should parse a URI with hostname', function () {
      const parsed = parseUri('udp://telegraf:8094');
      parsed.should.eql(['telegraf', 8094]);
    });

    it('should parse a URI with IPv4 address', function () {
      const parsed = parseUri('udp://127.0.0.1:8094');
      parsed.should.eql(['127.0.0.1', 8094]);
    });

    it('should parse a URI without IPv4 address or hostname', function () {
      const parsed = parseUri('udp://:8094');
      parsed.should.eql(['localhost', 8094]);
    });

    it('should parse a URI without scheme', function () {
      const parsed = parseUri('telegraf:8094');
      parsed.should.eql(['telegraf', 8094]);
    });
  });
});
