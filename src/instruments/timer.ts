import { FieldCollector } from '@/types';
import { isThenable } from '@/util';

export default function timer(collect: FieldCollector, func: Function) {
  return function (this: ThisType<any>, ...args: any[]) {
    const start = process.hrtime.bigint();
    let result;
    try {
      result = func.apply(this, args);
      if (isThenable(result)) {
        return result.finally(() => collect(this, process.hrtime.bigint() - start));
      }
      return result;
    } finally {
      if (!isThenable(result)) {
        collect(this, process.hrtime.bigint() - start);
      }
    }
  };
}
