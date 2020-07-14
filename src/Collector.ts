import { MeasurementPayload, MeasurementCollector } from './types';

export default class Collector {
  static initialize() {
    if (!global.__besiktning) {
      global.__besiktning = {
        collect: undefined
      };
    }
  }

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

Collector.initialize();
