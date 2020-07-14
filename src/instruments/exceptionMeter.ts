import { FieldCollector } from '../types';
import { isThenable } from '../util';

export default function exceptionMeter(collect: FieldCollector, func: Function) {
  let result;
  try {
    result = func();
    if (isThenable(result)) {
      return result.then(
        (result: any) => result,
        (err: any): never => {
          try {
            collect(process.hrtime.bigint());
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
        collect(process.hrtime.bigint());
      } finally {
        throw err;
      }
    }
  }
}
