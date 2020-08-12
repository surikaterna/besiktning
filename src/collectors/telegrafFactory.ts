import dgram from 'dgram';
import { LoggerFactory } from 'slf';
import { FieldValue, Dictionary } from '../types';

const LOG = LoggerFactory.getLogger('besiktning:telegrafFactory');

interface TelegrafPayload {
  measurement: string;
  tags?: Dictionary<string>;
  fields: Dictionary<FieldValue>;
  timestamp?: number | bigint | string;
}

interface TelegrafFactoryOptions {
  uri: string;
  bufferSize?: number;
  flushInterval?: number;
  prefix?: string;
}

export interface Telegraf {
  (payload: TelegrafPayload): void;
  dispose: () => void;
}

type MessageBuffer = NonNullable<string[]>;

export function parseUri(uri: string): [string, number] {
  const uriParts = uri?.split(':') ?? [];
  const host = uriParts[uriParts.length - 2]?.replace(/^\/*/, '');
  const port = parseInt(uriParts[uriParts.length - 1], 10);
  return [host === '' ? 'localhost' : host, isNaN(port) ? 8094 : port];
}

function serialize(itemSerializer: (key: string, value: FieldValue) => string, dict: { [key: string]: FieldValue }) {
  return Object.keys(dict)
    .sort()
    .map(key => itemSerializer(key, dict[key]))
    .join(',');
}

function tagToString(key: string, value: FieldValue): string {
  return [key, value].map(item => (item as string).replace(/([ ,=])/g, '\\$1')).join('=');
}

function fieldToString(key: string, value: FieldValue): string {
  const escapedKey = key.replace(/([ ,=])/g, '\\$1');
  const escapedValue = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : value;
  return `${escapedKey}=${escapedValue}`;
}

export function getInfluxLine(payload: TelegrafPayload): string {
  const { measurement, tags, fields, timestamp } = payload;
  const tagsList = tags ? `,${serialize(tagToString, tags)}` : '';
  const fieldsList = serialize(fieldToString, fields);
  return `${measurement.replace(/([ ,])/g, '\\$1')}${tagsList} ${fieldsList} ${timestamp ? timestamp : `${Date.now()}000000`}\n`;
}

export default function telegrafFactory(options: TelegrafFactoryOptions): Telegraf {
  const { prefix } = options;
  const flushInterval = options.flushInterval || 0;
  const bufferSize = options.bufferSize || 1;
  const [host, port]: [string, number] = parseUri(options.uri);
  const dgramSocket: dgram.Socket = dgram.createSocket('udp4');

  const flush = function (messages: MessageBuffer, callback?: () => void) {
    dgramSocket.send(messages, port, host, function (err: Error | null): void {
      if (err) {
        LOG.error(err);
        if (messages.length > 0) {
          LOG.error('Failed to send to Telegraf:', JSON.stringify(messages));
        }
      }
      if (callback) {
        callback();
      }
    });
  };

  let buffer: MessageBuffer = [];

  const telegraf = function (payload: TelegrafPayload): void {
    if (prefix) {
      payload.measurement = `${prefix}.${payload.measurement}`;
    }
    buffer.push(getInfluxLine(payload));
    if (buffer.length < bufferSize) {
      return;
    }
    flush(buffer, () => {
      buffer = [];
    });
  };

  if (flushInterval > 0) {
    const intervalHandle = setInterval(function () {
      if (buffer.length === 0) {
        return;
      }
      const bufferCopy = buffer.slice();
      buffer = [];
      flush(bufferCopy);
    }, flushInterval);
    telegraf.dispose = () => clearInterval(intervalHandle);
  } else {
    telegraf.dispose = () => {};
  }

  return telegraf;
}
