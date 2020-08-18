import { FieldCollector } from '../types';
import { isThenable } from '../util';

export default function exceptionMeter<F extends (...args: any) => any>(collect: FieldCollector, func: F): ReturnType<F> {
  let result;
  try {
    result = func();
    if (isThenable(result)) {
      return result.then(
        (unwrappedResult: any) => unwrappedResult,
        (err: any): never => {
          try {
            collect(1);
          } finally {
            throw err;
          }
        }
      );
    }
  } catch (err) {
    if (!isThenable(result)) {
      try {
        collect(1);
      } finally {
        throw err;
      }
    }
  }
  return result;
}
