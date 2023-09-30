import { Indexable, quickselect } from '../array.js';
import { gt } from '../assert.js';
import { assert } from '../index.js';
import { lerp } from '../math.js';

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

  return [
    percentile(sample, 0.25),
    percentile(sample, 0.75)
  ];
}

/** Median of the given sample */
export function median(sample: Indexable<number>): number {
  gt(sample.length, 0);
  return percentile(sample, 0.5);
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
 * Quartile coefficient of dispersion (QCD)
 * https://en.wikipedia.org/wiki/Quartile_coefficient_of_dispersion
 * https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/cqv_conf.htm
 * 
 * The QCD should typically only be used for ratio data.
 * That is, the data should be continuous and have a meaningful zero.
 */
export function qcd(iqr: [number, number]) {
  gt(iqr[0], 0);
  gt(iqr[1], 0);

  return (iqr[1] - iqr[0]) / (iqr[1] + iqr[0]);
}

export function percentile(sample: Indexable<number>, q: number) {
  assert.inRange(q, 0, 1);

  let index = q * (sample.length - 1);
  let frac = index % 1;

  if (frac === 0) {
    return sample[quickselect(sample, index)];
  } else {
    const lo = sample[quickselect(sample, Math.floor(index))];
    const hi = sample[quickselect(sample, Math.ceil(index))];

    return lerp(lo, hi, frac);
  }
}
