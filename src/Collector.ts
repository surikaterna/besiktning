import { MeasurementPayload, MeasurementCollector, InternalMeasurementCollector, EvaluatedMeasurementPayload } from './types';

export function evaluate(this: any, payload: MeasurementPayload, args: any[]): EvaluatedMeasurementPayload {
  const evaluatedPayload: Partial<EvaluatedMeasurementPayload> = {};
  const keys: string[] = Object.keys(payload).filter(key => !['apply', 'key', 'value'].includes(key));
  for (const key of keys as Array<keyof MeasurementPayload>) {
    const value: unknown = payload[key];
    evaluatedPayload[key as keyof EvaluatedMeasurementPayload] = typeof value === 'function' ? value.apply(this, args) : value;
  }
  const { apply, key, value } = payload;
  const evaluatedKey = typeof key === 'function' ? key.apply(this, args) : key;
  evaluatedPayload.fields = {
    [evaluatedKey]: apply?.call(this, value) ?? value
  };
  return evaluatedPayload as EvaluatedMeasurementPayload;
}

export default class Collector {
  static initialize() {
    if (!global.__besiktning) {
      global.__besiktning = {
        collect: undefined
      };
    }
  }

  static set(collect: MeasurementCollector): void {
    global.__besiktning.collect = function (this: any, payload: MeasurementPayload, args: any[]): void {
      try {
        collect(evaluate.call(this, payload, args));
      } catch (err) {
        console.error(err);
        console.error(`Failed to collect metrics from "${payload.target}" with "${payload.instrument}"`);
      }
    };
  }

  static get(): InternalMeasurementCollector | undefined {
    return global.__besiktning.collect;
  }
}

Collector.initialize();
