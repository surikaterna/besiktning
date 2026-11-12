import { Counter, Gauge, Histogram, Meter, metrics } from '@opentelemetry/api';
import { LoggerFactory } from 'slf';
import { EvaluatedMeasurementPayload, MeasurementCollector } from '../types';

const LOG = LoggerFactory.getLogger('besiktning:otelFactory');

export interface OtelFactoryOptions {
  meter?: Meter;
  meterName?: string;
  meterVersion?: string;
  prefix?: string;
}

export type OtelCollector = MeasurementCollector;

type InstrumentedMeasurementPayload = EvaluatedMeasurementPayload & {
  instrument: string;
};

function getValue(value: unknown, metricName: string): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  LOG.warn(`Ignored non-numeric value for OTEL metric "${metricName}"`);
  return undefined;
}

export default function otelFactory(options: OtelFactoryOptions = {}): OtelCollector {
  const meter = options.meter ?? metrics.getMeter(options.meterName ?? 'besiktning', options.meterVersion);
  const counters = new Map<string, Counter>();
  const histograms = new Map<string, Histogram>();
  const gauges = new Map<string, Gauge>();

  return function collect(payload: EvaluatedMeasurementPayload): void {
    const { instrument } = payload as InstrumentedMeasurementPayload;
    Object.entries(payload.fields).forEach(([key, fieldValue]) => {
      const metricName = [options.prefix, payload.measurement, key].filter(Boolean).join('.');
      const value = getValue(fieldValue, metricName);
      if (value === undefined) {
        return;
      }

      if (instrument === 'meter' || instrument === 'exceptionMeter') {
        let counter = counters.get(metricName);
        if (!counter) {
          counter = meter.createCounter(metricName);
          counters.set(metricName, counter);
        }
        counter.add(value, payload.tags);
        return;
      }

      if (instrument === 'timer') {
        let histogram = histograms.get(metricName);
        if (!histogram) {
          histogram = meter.createHistogram(metricName, { unit: 'ns' });
          histograms.set(metricName, histogram);
        }
        histogram.record(value, payload.tags);
        return;
      }

      let gauge = gauges.get(metricName);
      if (!gauge) {
        gauge = meter.createGauge(metricName);
        gauges.set(metricName, gauge);
      }
      gauge.record(value, payload.tags);
    });
  };
}
