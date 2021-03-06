import { CollectorPayload, DecoratorPayload, FieldCollector, Instrument } from './types';
import Collector from './Collector';
import meter from './instruments/meter';
import exceptionMeter from './instruments/exceptionMeter';
import gauge from './instruments/gauge';
import timer from './instruments/timer';

function withCollector(instrument: Instrument) {
  return function <F extends (...args: any) => any>(func: F, payload: CollectorPayload) {
    return function (this: any, ...args: Parameters<F>): ReturnType<F> {
      const collect: FieldCollector = value => Collector.get()?.call(this, { ...payload, value }, args);
      if (typeof collect !== 'function') {
        return func.apply(this, args);
      }
      return instrument(collect, func.bind(this, ...args));
    };
  };
}

export function createDecorator(instrument: Instrument) {
  return function (payload: DecoratorPayload) {
    return function (target: any, propertyKey?: string, descriptor?: TypedPropertyDescriptor<any>): any {
      const collectorPayload = {
        ...payload,
        instrument: instrument.name,
        target: propertyKey ?? target?.name ?? ''
      };
      if (!descriptor) {
        return withCollector(instrument)(target, collectorPayload);
      }
      const { value: targetFunction } = descriptor;
      descriptor.value = withCollector(instrument)(targetFunction, collectorPayload);
      return descriptor as TypedPropertyDescriptor<any>;
    };
  };
}

export const withMeter = createDecorator(meter);
export const withExceptionMeter = createDecorator(exceptionMeter);
export const withGauge = createDecorator(gauge);
export const withTimer = createDecorator(timer);
