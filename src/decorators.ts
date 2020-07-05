import meter from '@/instruments/meter';
import exceptionMeter from '@/instruments/exception-meter';
import gauge from '@/instruments/gauge';
import timer from '@/instruments/timer';
import {
  InstrumentPayload,
  MeasurementPayload,
  MeasurementCollector,
  CollectorPayload,
  FieldCollector,
  FieldValue
} from '@/types';

function createCollector(payload: CollectorPayload): FieldCollector {
  return function (self: any, value: FieldValue): void {
    // FIXME: Find a way to make `this` work here; caller should not have to explicitly provide `this`: bind `this` to the function.
    if (self?.hasOwnProperty('_collect')) {
      const { key } = payload;
      // TODO: Improve: Dynamically evaluate all DynamicString values, not just `key`.
      self._collect.call(self, {
        ...payload,
        key: typeof key === 'function' ? key.call(self) : key,
        value: payload.endomorphism?.call(self, value) ?? value
      });
    }
  };
}

function createMethodDecorator(instrument: Function) {
  return function (payload: InstrumentPayload) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
      const { value: targetFunction } = descriptor;
      const enrichedPayload = {
        ...payload,
        instrument: propertyKey
      };
      descriptor.value = instrument(createCollector(enrichedPayload), targetFunction);
      return descriptor;
    };
  };
}

export function Measured(collect: MeasurementCollector) {
  return function <T extends { new(...constructorArgs: any[]): {} }>(constructor: T) {
    return class extends constructor {
      _collect: MeasurementCollector = collect;
    };
  };
}

export const Metered = createMethodDecorator(meter);
export const ExceptionMetered = createMethodDecorator(exceptionMeter);
export const Gauged = createMethodDecorator(gauge);
export const Timed = createMethodDecorator(timer);
