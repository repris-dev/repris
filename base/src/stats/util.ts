import { Indexable, quickselect } from '../array.js';
import { gt } from '../assert.js';

export function iqr(sample: Indexable<number>): [number, number] {
  gt(sample.length, 0);

  const n = sample.length;
  const lo = sample[quickselect(sample, Math.floor(n / 4))];
  const hi = sample[quickselect(sample, Math.floor(3 * (n / 4)))];

  return [lo, hi];
}

export function median(sample: Indexable<number>): number {
  gt(sample.length, 0);

  const n = sample.length;
  const midpoint = n / 2;

  if (n % 2 === 0) {
    const lo = sample[quickselect(sample, midpoint - 1)];
    const hi = sample[quickselect(sample, midpoint)];

    return (lo + hi) / 2;
  } else {
    return sample[quickselect(sample, Math.floor(midpoint))];
  }
}
