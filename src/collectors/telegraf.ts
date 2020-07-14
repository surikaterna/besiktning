import { FieldValue } from '../types';
import dgram from 'dgram';
const dgramClient = dgram.createSocket('udp4');

export interface TelegrafPayload {
  measurement: string;
  key: string;
  value: FieldValue;
  tags?: { [key: string]: string };
  timestamp?: Number | bigint;
}

export function parseUri(uri: string): [string, number] {
  const uriParts = uri?.split(':') ?? [];
  const host = uriParts[uriParts.length - 2]?.replace(/^\/*/, '') || 'localhost';
  const port = Number(uriParts[uriParts.length - 1] || 8094);
  return [host, port];
}

const [HOST, PORT] = parseUri(process.env.TELEGRAF_SOCKET_LISTENER_URI ?? '');

export default function telegraf(payload: TelegrafPayload): void {
  dgramClient.send(getInfluxLine(payload), PORT, HOST, err => {
    if (err) {
      console.error(err);
    }
    // TODO: Should we close the socket after each invocation?
  });
}

export function getInfluxLine(payload: TelegrafPayload): string {
  const { measurement, tags, key, value, timestamp } = payload;
  const tagsList = tags
    ? Object.keys(tags)
        .map(key => `${key}=${tags[key]}`)
        .join(',')
    : '';
  return `${measurement}${tagsList ? `,${tagsList}` : ''} ${key}=${value}${timestamp ? ` ${timestamp}` : ''}`;
}
