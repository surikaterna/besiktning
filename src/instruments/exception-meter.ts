import { FieldCollector } from '@/types';
import { isThenable } from '@/util';

export default function exceptionMeter(collect: FieldCollector, func: Function) {
  return function (this: ThisType<any>, ...args: any[]) {
    let result;
    try {
      result = func.apply(this, args);
      if (isThenable(result)) {
        return result.then(
          (result: any) => result,
          (err: any): never => {
            try {
              collect(this, process.hrtime.bigint());
            } finally {
              throw err;
            }
          }
        );
      }
      return result;
    } catch (err) {
      if (!isThenable(result)) {
        try {
          collect(this, process.hrtime.bigint());
        } finally {
          throw err;
        }
      }
    }
  };
}
