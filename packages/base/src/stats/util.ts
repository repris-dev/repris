import { ArrayView, quickselect } from '../array.js';
import { gt } from '../assert.js';
import { assert } from '../index.js';
import { lerp } from '../math.js';

/** median absolute deviation result */
export type MADResult = {
  mad: number;
  /**
   * Normal-consistent measure of standard deviation. Assumes
   * The input distribution is normal.
   */
  normMad: number;
};

export function iqr(sample: ArrayView<number>): [number, number] {
  gt(sample.length, 0);

  return [quantile(sample, 0.25), quantile(sample, 0.75)];
}

/** Median of the given sample */
export function median(sample: ArrayView<number>, sorted?: boolean): number {
  gt(sample.length, 0);
  return quantile(sample, 0.5, sorted);
}

/** median absolute deviation of the given sample */
export function mad(sample: ArrayView<number>, x: number = median(sample), p = 0.5): MADResult {
  const devs = new Float64Array(sample.length);

  for (let i = 0; i < devs.length; i++) {
    devs[i] = Math.abs(x - sample[i]);
  }

  const mad = quantile(devs, p);

  return {
    mad,
    normMad: 1.4826 * mad,
  };
}

/** Average absolute deviation */
export function aad(sample: ArrayView<number>, x: number = median(sample)): number {
  gt(sample.length, 0);

  let devs = 0;
  for (let i = 0; i < sample.length; i++) {
    devs += Math.abs(x - sample[i]);
  }

  return devs / sample.length;
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

export function quantile(sample: ArrayView<number>, q: number, sorted?: boolean) {
  assert.inRange(q, 0, 1);
  if (sorted) assert.isSorted(sample);

  let index = q * (sample.length - 1);
  let frac = index % 1;

  if (frac === 0) {
    const kdx = sorted ? index : quickselect(sample, index);
    return sample[kdx];
  } else {
    const lodx = sorted ? Math.floor(index) : quickselect(sample, Math.floor(index));
    const hidx = sorted ? Math.ceil(index) : quickselect(sample, Math.ceil(index));

    return lerp(sample[lodx], sample[hidx], frac);
  }
}

/**
 * The function Φ(x) is the cumulative density function (CDF) of a
 * standard normal (Gaussian) random variable
 * https://www.johndcook.com/erf_and_normal_cdf.pdf
 */
export function stbPhi(x: number) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  /* Save the sign of x */
  let sign = x < 0 ? -1 : 1;

  x = Math.abs(x) / Math.SQRT2;

  /* A&S formula 7.1.26 */
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/* Returns the adjusted Šidák P-value */
export function sidak(p: number, comparisons: number) {
  return 1.0 - Math.pow(1.0 - p, comparisons);
}

/**
 * The Jarque–Bera test is a goodness-of-fit test of whether sample data have the
 * skewness and kurtosis matching a normal distribution.
 *
 * @param n Sample size
 * @param S Skewness
 * @param K Kurtosis
 * @param ddof delta-degrees-of freedom
 * @returns A non-negative number which if close to zero indicates a normal-distribution
 */
export function jarqueBera(n: number, S: number, K: number, ddof = 0) {
  return ((n - ddof) / 6) * (S * S + (1 / 4) * (K * K));
}

/**
 * Relative margin of error
 * The relative margin of error is the percentage of deviation possible (i.e a radius)
 * around the point estimate at a specific confidence interval.
 * 
 * Reference: Duran v. U.S. Bank Nat. Ass’n, 325 (Cal. 2014)
 */
export function rme(interval: [number, number], estimate: number) {
  return (interval[1] - interval[0]) / 2 / estimate;
}

/** Hedges-G standardized effect size */
export function hedgesG(
  n0: number,
  mean0: number,
  std0: number,
  n1: number,
  mean1: number,
  std1: number,
) {
  assert.gt(n0 + n1, 2);

  const n = n0 + n1;
  // Pooled and weighted variance
  const sSq = ((n0 - 1) * std0 ** 2 + (n1 - 1) * std1 ** 2) / (n - 2);
  // bias correction (Durlak) - https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/hedgeg.htm
  const correction = ((n - 3) / (n - 2.25)) * Math.sqrt((n - 2) / n);

  return (Math.abs(mean0 - mean1) / Math.sqrt(sSq)) * correction;
}

/** Sums the given array of numbers, compensating for numerical errors with Kahan summation */
export function sum(xs: ArrayView<number>, i = 0, len = xs.length - i) {
  // Prepare the accumulator.
  let sum = 0.0
  // A running compensation for lost low-order bits.
  let c = 0.0
  // The array input has elements indexed input[1] to input[input.length].

  for (let k = i + len; i < k; i++) {
    let y = xs[i] - c;
    let t = sum + y;
 
    // Algebraically, c is always 0
    // when t is replaced by its
    // value from the above expression.
    // But, when there is a loss,
    // the higher-order y is cancelled
    // out by subtracting y from c and
    // all that remains is the
    // lower-order error in c
    c = (t - sum) - y;

    sum = t;
  }

  return sum
}
