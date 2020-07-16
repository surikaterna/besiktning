import { FieldValue, Dictionary } from '../types';
import dgram from 'dgram';

interface TelegrafPayload {
  measurement: string;
  tags?: Dictionary<string>;
  fields: Dictionary<FieldValue>;
  timestamp?: number | bigint | string;
}

type Telegraf = (payload: TelegrafPayload) => void;

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

export default function telegrafFactory(uri: string, bufferSize: number, prefix: string): Telegraf {
  const [host, port]: [string, number] = parseUri(uri);
  const dgramSocket: dgram.Socket = dgram.createSocket('udp4');
  let buffer: NonNullable<string[]> = [];
  return function (payload: TelegrafPayload): void {
    if (prefix) {
      payload.measurement = `${prefix}.${payload.measurement}`;
    }
    buffer.push(getInfluxLine(payload));
    if (buffer.length < bufferSize) {
      return;
    }
    dgramSocket.send(buffer, port, host, function (err: Error | null): void {
      if (err) {
        console.error(err);
        if (buffer.length > 0) {
          console.error('Failed to send to Telegraf:', JSON.stringify(buffer));
        }
      }
      buffer = [];
    });
  };
}
