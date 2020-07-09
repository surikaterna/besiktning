import { MeasurementPayload, MeasurementCollector } from '@/types';

if (!global.__besiktning) {
  global.__besiktning = {
    collect: undefined
  };
}

function evaluate(payload: MeasurementPayload): MeasurementPayload {
  const evaluatedPayload: Partial<MeasurementPayload> = {};
  for (let key of Object.keys(payload) as Array<keyof MeasurementPayload>) {
    let value: unknown = payload[key];
    evaluatedPayload[key] = typeof value === 'function' && key !== 'apply' ? value() : value;
  }
  const { apply, value } = payload;
  evaluatedPayload.value = apply?.call(null, value) ?? value;
  return evaluatedPayload as MeasurementPayload;
}

// TODO: Batch measurements in `Collector`?
// TODO: Implement middleware functionality?
export default class Collector {
  static set(collect: MeasurementCollector): void {
    // TODO: Throw error? Log error? Resume silently?
    global.__besiktning.collect = (payload: MeasurementPayload): void => collect(evaluate(payload));
  }

  static get(): MeasurementCollector | undefined {
    return global.__besiktning.collect;
  }
}
