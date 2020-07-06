export type DynamicString = NonNullable<string> | (() => NonNullable<string>);

export type FieldValue = NonNullable<number | bigint | string | boolean>;

export interface InstrumentPayload {
  measurement: DynamicString;
  key: DynamicString;
  tags?: { [key: string]: DynamicString };
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
