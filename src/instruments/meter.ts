import { FieldCollector } from '../types';

export default function meter(collect: FieldCollector, func: Function): unknown {
  collect(Date.now());
  return func();
}
