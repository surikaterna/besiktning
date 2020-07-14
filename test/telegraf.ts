import dgram from 'dgram';
import sinon from 'sinon';
import chai from 'chai';
import Collector from '../src/Collector';
import telegraf, { getInfluxLine, TelegrafPayload, parseUri } from '../src/collectors/telegraf';
import { withGauge } from '../src/decorators';

const should = chai.should();

function wait(s: number): void {
  const ms = s * 1000;
  const start = Date.now();
  while (Date.now() < start + ms) {}
}

function sum(a: number, b: number): number {
  return a + b;
}

let linesSentToMockSocket: string[] = [];

describe('Telegraf integration', function () {
  describe('telegraf', function () {
    before(function () {
      sinon.replace(
        dgram.Socket.prototype,
        'send',
        sinon.fake(function (lines: string[], port: number, hostname: string, callback: Function) {
          linesSentToMockSocket.push(...lines);
          callback(null);
        })
      );
      Collector.set(telegraf);
    });

    beforeEach(function () {
      linesSentToMockSocket = [];
    });

    it('should send data to UDP socket', function () {
      const gaugedAdder = withGauge({ measurement: 'besiktning', key: 'sum', tags: { tag1: 'tag_value1', tag2: 'tag_value2' } })(sum);
      this.timeout(0);
      gaugedAdder(1, 2);
      wait(1);
      gaugedAdder(2, 3);
      wait(1);
      gaugedAdder(3, 4);
      const sums = [3, 5, 7];
      sums.forEach((sum, i) => {
        const line = linesSentToMockSocket[i];
        const lineRegExp = new RegExp(`^besiktning,tag1=tag_value1,tag2=tag_value2 sum=${sum} [0-9]{19}\n$`);
        line.should.match(lineRegExp);
      });
    });

    it('should buffer data', function () {
      const gaugedAdder = withGauge({ measurement: 'besiktning', key: 'sum', tags: { tag1: 'tag_value1', tag2: 'tag_value2' } })(sum);
      gaugedAdder(1, 2);
      wait(1);
      gaugedAdder(2, 3);
      linesSentToMockSocket.should.be.empty;
    });
  });

  describe('getInfluxLine', function () {
    it('should transform payload without tags', function () {
      const timestamp = `${Date.now()}000000`;
      const payload: TelegrafPayload = {
        measurement: 'test',
        key: 'key',
        value: true,
        timestamp
      };
      const influxLine = getInfluxLine(payload);
      const expected = `test key=true ${timestamp}\n`;
      influxLine.should.equal(expected);
    });

    it('should transform payload without tags and timestamp', function () {
      const payload: TelegrafPayload = {
        measurement: 'test',
        key: 'key',
        value: 42
      };
      const influxLine = getInfluxLine(payload);
      const expected = /^test key=42 [0-9]{19}\n$/;
      influxLine.should.match(expected);
    });

    it('should transform payload', function () {
      const timestamp = `${Date.now()}000000`;
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
      const expected = `test,first=one,second=two key="value" ${timestamp}\n`;
      influxLine.should.equal(expected);
    });

    it('should escape special characters', function () {
      const timestamp = `${Date.now()}000000`;
      const payload: TelegrafPayload = {
        measurement: 'test,one two',
        key: 'ke,y',
        value: 'val"u e',
        timestamp
      };
      const influxLine = getInfluxLine(payload);
      const expected = `test\\,one\\ two ke\\,y="val\\"u e" ${timestamp}\n`;
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
