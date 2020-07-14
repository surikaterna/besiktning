import { FieldValue } from '../types';
import dgram from 'dgram';
const dgramClient = dgram.createSocket('udp4');

let MEASUREMENT_BUFFER: string[] = [];
const BUFFER_SIZE = 3;

export interface TelegrafPayload {
  measurement: string;
  key: string;
  value: FieldValue;
  tags?: { [key: string]: string };
  timestamp?: Number | bigint | string;
}

export function parseUri(uri: string): [string, number] {
  const uriParts = uri?.split(':') ?? [];
  const host = uriParts[uriParts.length - 2]?.replace(/^\/*/, '');
  const port = parseInt(uriParts[uriParts.length - 1], 10);
  return [host === '' ? 'localhost' : host, isNaN(port) ? 8094 : port];
}

const [HOST, PORT] = parseUri(process.env.TELEGRAF_SOCKET_LISTENER_URI ?? '');

export default function telegraf(payload: TelegrafPayload): void {
  MEASUREMENT_BUFFER.push(getInfluxLine(payload));
  if (MEASUREMENT_BUFFER.length < BUFFER_SIZE) {
    return;
  }
  dgramClient.send(MEASUREMENT_BUFFER, PORT, HOST, err => {
    if (err) {
      console.error(err);
    }
    MEASUREMENT_BUFFER = [];
  });
}

function serialize(itemSerializer: (key: string, value: FieldValue) => string, dict: { [key: string]: FieldValue }) {
  return Object.keys(dict)
    .sort()
    .map(key => itemSerializer(key, dict[key]))
    .join(',');
}

function tagToString(key: string, value: FieldValue): string {
  const [escapedKey, escapedValue] = [key, value].map(item => (item as string).replace(/([ ,=])/g, '\\$1'));
  return `${escapedKey}=${escapedValue}`;
}

function fieldToString(key: string, value: FieldValue): string {
  const escapedKey = key.replace(/([ ,=])/g, '\\$1');
  const escapedValue = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : value;
  return `${escapedKey}=${escapedValue}`;
}

export function getInfluxLine(payload: TelegrafPayload): string {
  const { measurement, tags, key, value, timestamp } = payload;
  const tagsList = tags ? `,${serialize(tagToString, tags)}` : '';
  const fieldsList = serialize(fieldToString, { [key]: value });
  return `${measurement.replace(/([ ,])/g, '\\$1')}${tagsList} ${fieldsList} ${timestamp ? timestamp : `${Date.now()}000000`}\n`;
}
