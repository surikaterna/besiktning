export type FieldValue = NonNullable<number | bigint | string | boolean>;
export type Dynamic<T> = T | ((...args: any) => T);
export type Dictionary<T> = { [key: string]: T };

export interface DecoratorPayload {
  measurement: Dynamic<string>;
  key: Dynamic<string>;
  tags?: Dynamic<Dictionary<string>>;
  apply?: (value: FieldValue) => FieldValue;
}

export interface CollectorPayload extends DecoratorPayload {
  instrument: string;
  target: string;
}

export interface MeasurementPayload extends CollectorPayload {
  value: FieldValue;
}

export interface EvaluatedMeasurementPayload {
  measurement: string;
  tags?: Dictionary<string>;
  fields: Dictionary<FieldValue>;
}

export type MeasurementCollector = (payload: EvaluatedMeasurementPayload) => void;
export type InternalMeasurementCollector = (payload: MeasurementPayload, args: any[]) => void;

export type FieldCollector = (value: FieldValue) => void;

export type Instrument = <F extends (...args: any) => any>(collect: FieldCollector, func: F) => ReturnType<F>;

export type ThenArg<T> = T extends PromiseLike<infer A> ? A : T;
