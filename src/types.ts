export type Dynamic<T> = NonNullable<T> | ((payload?: Partial<MeasurementPayload>) => NonNullable<T>);

export type FieldValue = NonNullable<number | bigint | string | boolean>;

export interface DecoratorPayload {
  measurement: Dynamic<string>;
  key: Dynamic<string>;
  tags?: Dynamic<{ [key: string]: string }>;
  apply?: (value: FieldValue) => FieldValue;
}

export interface CollectorPayload extends DecoratorPayload {
  instrument: string;
  target: string;
}

export interface MeasurementPayload extends CollectorPayload {
  value: FieldValue;
}

export type MeasurementCollector = (payload: MeasurementPayload) => void;

export type FieldCollector = (value: FieldValue) => void;

export type Instrument = (collect: FieldCollector, func: (...args: any[]) => any) => any;
