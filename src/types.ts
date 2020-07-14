export type FieldValue = NonNullable<number | bigint | string | boolean>;

export interface DecoratorPayload {
  measurement: string;
  key: string;
  tags?: { [key: string]: string };
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
