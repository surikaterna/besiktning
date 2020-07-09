import { FieldCollector } from '@/types';
import { isThenable } from '@/util';

export default function timer(collect: FieldCollector, func: Function) {
  const start = process.hrtime.bigint();
  let result;
  try {
    result = func();
    if (isThenable(result)) {
      return result.finally(() => collect(process.hrtime.bigint() - start));
    }
    return result;
  } finally {
    if (!isThenable(result)) {
      collect(process.hrtime.bigint() - start);
    }
  }
}
