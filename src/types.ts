export type DynamicString = NonNullable<string> | (() => NonNullable<string>);

export type FieldValue = NonNullable<number | bigint | string | boolean>;

export interface InstrumentPayload {
  measurement: DynamicString;
  key: DynamicString;
  tags?: { [key: string]: DynamicString };
  endomorphism?: (value: FieldValue) => FieldValue;
}

export interface MeasurementPayload extends InstrumentPayload {
  instrument: DynamicString;
  value: FieldValue;
}

export type CollectorPayload = Omit<MeasurementPayload, 'value'>;

export type MeasurementCollector = (payload: MeasurementPayload) => void;

export type FieldCollector = (self: any, value: FieldValue) => void;
