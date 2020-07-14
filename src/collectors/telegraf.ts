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
  dgramClient.send(MEASUREMENT_BUFFER.join('\n'), PORT, HOST, err => {
    if (err) {
      console.error(err);
    }
    MEASUREMENT_BUFFER = [];
  });
}

export function getInfluxLine(payload: TelegrafPayload): string {
  const { measurement, tags, key, value, timestamp } = payload;
  const tagsList = tags
    ? Object.keys(tags)
        .map(key => `${key}=${tags[key]}`)
        .join(',')
    : '';
  return `${measurement}${tagsList ? `,${tagsList}` : ''} ${key}=${value} ${timestamp ? timestamp : `${Date.now()}000000`}`;
}
