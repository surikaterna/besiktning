export function isThenable(x: any): boolean {
  return typeof x === 'object' && typeof x?.then === 'function';
}
