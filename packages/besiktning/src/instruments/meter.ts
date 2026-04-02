import { FieldCollector } from '../types';

export default function meter<F extends (...args: any) => any>(collect: FieldCollector, func: F): ReturnType<F> {
  collect(1);
  return func();
}
