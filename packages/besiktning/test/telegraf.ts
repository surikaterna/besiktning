import dgram from 'dgram';
import sinon from 'sinon';
import { expect } from 'chai';
import Collector from '../src/Collector';
import telegrafFactory, { getInfluxLine, parseUri, Telegraf } from '../src/collectors/telegrafFactory';
import { withGauge } from '../src/decorators';

const BUFFER_SIZE = 3;
const FLUSH_INTERVAL = 5 * 1000;

function sum(a: number, b: number): number {
  return a + b;
}

let telegraf: Telegraf;
let linesSentToMockSocket: string[] = [];
let clock: sinon.SinonFakeTimers;

describe('Telegraf module', function () {
  before(function () {
    sinon.replace(
      dgram.Socket.prototype,
      'send',
      // @ts-ignore
      sinon.fake(function (lines: string[], port: number, hostname: string, callback: (...args: any) => any) {
        linesSentToMockSocket.push(...lines);
        callback(null);
      })
    );
  });

  describe('telegraf', function () {
    beforeEach(function () {
      clock = sinon.useFakeTimers();
      telegraf = telegrafFactory({
        uri: 'udp://:8094',
        bufferSize: BUFFER_SIZE,
        prefix: 'besiktning',
        flushInterval: FLUSH_INTERVAL
      });
      Collector.set(telegraf);
      linesSentToMockSocket = [];
    });

    afterEach(function () {
      clock.restore();
      telegraf.dispose();
    });

    it('should send data to UDP socket', function () {
      const payload = {
        measurement: 'send_udp',
        key: 'sum',
        tags: {
          tag1: 'tag_value1',
          tag2: 'tag_value2'
        }
      };
      const gaugedAdder = withGauge(payload)(sum);
      gaugedAdder(1, 2);
      clock.tick(1000);
      gaugedAdder(2, 3);
      clock.tick(1000);
      gaugedAdder(3, 4);
      const expectedLines = [
        'besiktning.send_udp,tag1=tag_value1,tag2=tag_value2 sum=3 0000000\n',
        'besiktning.send_udp,tag1=tag_value1,tag2=tag_value2 sum=5 1000000000\n',
        'besiktning.send_udp,tag1=tag_value1,tag2=tag_value2 sum=7 2000000000\n'
      ];
      expect(linesSentToMockSocket).to.deep.equal(expectedLines);
    });

    it('should buffer data', function () {
      const payload = {
        measurement: 'buffer',
        key: 'sum',
        tags: {
          tag1: 'tag_value1',
          tag2: 'tag_value2'
        }
      };
      const gaugedAdder = withGauge(payload)(sum);
      gaugedAdder(1, 2);
      for (let i = 0; i < BUFFER_SIZE - 2; i++) {
        clock.tick(1000);
        gaugedAdder(2 + i, 3 + i);
      }
      expect(linesSentToMockSocket).to.be.empty;
    });

    it('should automatically flush buffer after elapsed time interval', function () {
      const payload = {
        measurement: 'buffer',
        key: 'sum',
        tags: {
          tag1: 'tag_value1',
          tag2: 'tag_value2'
        }
      };
      const gaugedAdder = withGauge(payload)(sum);
      gaugedAdder(1, 1);
      clock.tick(FLUSH_INTERVAL);
      const expectedMessages = ['besiktning.buffer,tag1=tag_value1,tag2=tag_value2 sum=2 0000000\n'];
      expect(linesSentToMockSocket).to.deep.equal(expectedMessages);
    });
  });

  describe('getInfluxLine', function () {
    it('should transform payload without tags', function () {
      const timestamp = `${Date.now()}000000`;
      const payload = {
        measurement: 'test',
        fields: { key: true },
        timestamp
      };
      const influxLine = getInfluxLine(payload);
      const expected = `test key=true ${timestamp}\n`;
      expect(influxLine).to.equal(expected);
    });

    it('should transform payload without tags and timestamp', function () {
      const payload = {
        measurement: 'test',
        fields: { key: 42 }
      };
      const influxLine = getInfluxLine(payload);
      const expected = /^test key=42 [0-9]{19}\n$/;
      expect(influxLine).to.match(expected);
    });

    it('should transform payload', function () {
      const timestamp = `${Date.now()}000000`;
      const payload = {
        measurement: 'test',
        fields: { key: 'a_string' },
        tags: {
          first: 'one',
          second: 'two'
        },
        timestamp
      };
      const influxLine = getInfluxLine(payload);
      const expected = `test,first=one,second=two key="a_string" ${timestamp}\n`;
      expect(influxLine).to.equal(expected);
    });

    it('should escape special characters', function () {
      const timestamp = `${Date.now()}000000`;
      const payload = {
        measurement: 'test,one two',
        fields: { 'k e,y': 'val"u e' },
        tags: { 't a,g': 'val"u e' },
        timestamp
      };
      const influxLine = getInfluxLine(payload);
      const expected = `test\\,one\\ two,t\\ a\\,g=val"u\\ e k\\ e\\,y="val\\"u e" ${timestamp}\n`;
      expect(influxLine).to.equal(expected);
    });
  });

  describe('parseUri', function () {
    it('should parse a URI with hostname', function () {
      const parsed = parseUri('udp://telegraf:8094');
      expect(parsed).to.deep.equal(['telegraf', 8094]);
    });

    it('should parse a URI with IPv4 address', function () {
      const parsed = parseUri('udp://127.0.0.1:8094');
      expect(parsed).to.deep.equal(['127.0.0.1', 8094]);
    });

    it('should parse a URI without IPv4 address or hostname', function () {
      const parsed = parseUri('udp://:8094');
      expect(parsed).to.deep.equal(['localhost', 8094]);
    });

    it('should parse a URI without scheme', function () {
      const parsed = parseUri('telegraf:8094');
      expect(parsed).to.deep.equal(['telegraf', 8094]);
    });
  });
});
