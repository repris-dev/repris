import { Indexable, quickselect } from '../array.js';
import { gt } from '../assert.js';

/** median absolute deviation result */
export type MADResult = {
  mad: number,
  /**
   * Normal-consistent measure of standard deviation. Assumes
   * The input distribution is normal.
   */
  normMad: number
};

export function iqr(sample: Indexable<number>): [number, number] {
  gt(sample.length, 0);

  const n = sample.length;
  const lo = sample[quickselect(sample, Math.floor(n / 4))];
  const hi = sample[quickselect(sample, Math.floor(3 * (n / 4)))];

  return [lo, hi];
}

/** Median of the given sample */
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

/** median absolute deviation of the given sample */
export function mad(sample: Indexable<number>, x: number): MADResult {
  const devs = new Float64Array(sample.length);

  for (let i = 0; i < devs.length; i++) {
    devs[i] = Math.abs(x - sample[i]);
  }

  const mad = median(devs);

  return {
    mad, normMad: 1.4826 * mad
  }
}

/**
 * Quartile coefficient of dispersion
 * https://en.wikipedia.org/wiki/Quartile_coefficient_of_dispersion
 */
export function qcd(iqr: [number, number]) {
  return (iqr[1] - iqr[0]) / (iqr[0] + iqr[1]);
}
