import { FieldCollector, FieldValue } from '@/types';
import { isThenable } from '@/util';

export default function gauge(collect: FieldCollector, func: (...args: any[]) => FieldValue | Promise<FieldValue>) {
  return function (this: ThisType<any>, ...args: any[]) {
    const result: unknown = func.apply(this, args);
    if (isThenable(result)) {
      return (result as Promise<FieldValue>).then((result: unknown) => {
        collect(this, result as FieldValue);
        return result;
      });
    }
    collect(this, result as FieldValue);
    return result;
  };
}
