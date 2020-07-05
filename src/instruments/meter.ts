import { FieldCollector } from '@/types';
import { isThenable } from '@/util';

export default function meter(collect: FieldCollector, func: Function) {
  return function (this: ThisType<any>, ...args: any[]) {
    collect(this, process.hrtime.bigint());
    return func.apply(this, args);
  };
}
