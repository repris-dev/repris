import { Indexable, quickselect } from '../array.js';
import { gt } from '../assert.js';

export function iqr(sample: Indexable<number>): [number, number] {
  gt(sample.length, 0);

  const n = sample.length;
  const lo = sample[quickselect(sample, Math.floor(n / 4))];
  const hi = sample[quickselect(sample, Math.floor(3 * (n / 4)))];

  return [lo, hi];
}
