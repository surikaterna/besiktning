import { Counter, Gauge, Histogram, Meter } from '@opentelemetry/api';
import { expect } from 'chai';
import otelFactory from '../src/collectors/otelFactory';
import { EvaluatedMeasurementPayload } from '../src/types';

interface Recording {
  name: string;
  options?: { unit?: string };
  value: number;
  attributes?: Record<string, string>;
}

function createMeter(recordings: Recording[]): Meter {
  return {
    createCounter: (name: string, options?: object) =>
      ({
        add: (value: number, attributes?: Record<string, string>) => recordings.push({ name, options, value, attributes })
      } as Counter),
    createHistogram: (name: string, options?: object) =>
      ({
        record: (value: number, attributes?: Record<string, string>) => recordings.push({ name, options, value, attributes })
      } as Histogram),
    createGauge: (name: string, options?: object) =>
      ({
        record: (value: number, attributes?: Record<string, string>) => recordings.push({ name, options, value, attributes })
      } as Gauge)
  } as Meter;
}

function payload(instrument: string, value: number | bigint | string | boolean): EvaluatedMeasurementPayload & { instrument: string; target: string } {
  return {
    measurement: 'requests',
    fields: { duration: value },
    tags: { route: '/health' },
    instrument,
    target: 'handler'
  };
}

describe('OTEL module', function () {
  let recordings: Recording[];

  beforeEach(function () {
    recordings = [];
  });

  it('records meters as counters', function () {
    const collect = otelFactory({ meter: createMeter(recordings), prefix: 'service' });
    collect(payload('meter', 1));

    expect(recordings).to.deep.equal([{ name: 'service.requests.duration', options: undefined, value: 1, attributes: { route: '/health' } }]);
  });

  it('records timers as nanosecond histograms', function () {
    const collect = otelFactory({ meter: createMeter(recordings) });
    collect(payload('timer', 42n));

    expect(recordings).to.deep.equal([{ name: 'requests.duration', options: { unit: 'ns' }, value: 42, attributes: { route: '/health' } }]);
  });

  it('records gauges and converts booleans to numbers', function () {
    const collect = otelFactory({ meter: createMeter(recordings) });
    collect(payload('gauge', true));

    expect(recordings).to.deep.equal([{ name: 'requests.duration', options: undefined, value: 1, attributes: { route: '/health' } }]);
  });

  it('ignores string values', function () {
    const collect = otelFactory({ meter: createMeter(recordings) });
    collect(payload('gauge', 'not numeric'));

    expect(recordings).to.be.empty;
  });
});
