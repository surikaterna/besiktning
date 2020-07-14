import { MeasurementPayload, MeasurementCollector } from './types';

if (!global.__besiktning) {
  global.__besiktning = {
    collect: undefined
  };
}

// TODO: Batch measurements in `Collector`?
export default class Collector {
  static set(collect: MeasurementCollector): void {
    global.__besiktning.collect = (payload: MeasurementPayload): void => {
      try {
        collect({ ...payload, value: payload?.apply?.call(null, payload.value) ?? payload.value });
      } catch (err) {
        console.error(err);
      }
    };
  }

  static get(): MeasurementCollector | undefined {
    return global.__besiktning.collect;
  }
}
