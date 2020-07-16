import { FieldCollector } from '../types';
import { isThenable } from '../util';

type ThenArg<T> = T extends PromiseLike<infer A> ? A : T;

export default function gauge<F extends (...args: any) => any>(collect: FieldCollector, func: F): ReturnType<F> {
  const result = func();
  if (isThenable(result)) {
    return result.then((unwrappedResult: ThenArg<ReturnType<F>>) => {
      collect(unwrappedResult);
      return unwrappedResult;
    });
  }
  collect(result);
  return result;
}
