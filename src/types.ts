export type Dynamic<T> = NonNullable<T> | ((payload?: Partial<MeasurementPayload>) => NonNullable<T>);

export type FieldValue = NonNullable<number | bigint | string | boolean>;

export interface InstrumentPayload {
  measurement: Dynamic<string>;
  key: Dynamic<string>;
  tags?: { [key: string]: Dynamic<string> };
  apply?: (value: FieldValue) => FieldValue;
}

export interface MeasurementPayload extends InstrumentPayload {
  instrument: string;
  target: string;
  value: FieldValue;
}

export type CollectorPayload = Omit<MeasurementPayload, 'value'>;

export type MeasurementCollector = (payload: MeasurementPayload) => void;

export type FieldCollector = (self: any, value: FieldValue) => void;
