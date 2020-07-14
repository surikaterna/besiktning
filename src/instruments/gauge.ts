import { FieldCollector, FieldValue } from '../types';
import { isThenable } from '../util';

export default function gauge(collect: FieldCollector, func: () => FieldValue | Promise<FieldValue>) {
  const result = func();
  if (isThenable(result)) {
    return (result as Promise<FieldValue>).then((result: FieldValue) => {
      collect(result);
      return result;
    });
  }
  collect(result as FieldValue);
  return result;
}
