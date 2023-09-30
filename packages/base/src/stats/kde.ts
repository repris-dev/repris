import * as math from '../math.js';
import { lowerBound, sort } from '../array.js';
import { Indexable } from '../util.js';
import { MADResult } from './util.js';

const PI_SQRT = Math.sqrt(Math.PI);
const INV_2PI = 1 / Math.sqrt(2 * Math.PI);
const INV_4PI = 1 / Math.sqrt(4 * Math.PI);

export type Kernel = (x: number) => number

/** Gaussian kernel, mean = 0, variance = 1 */
export function gaussian(x: number) {
  return INV_2PI * Math.exp(-0.5 * x * x);
}

/** */
export function gaussianHat(x: number) {
  return INV_4PI * Math.exp(-0.25 * x * x);
}

/** Epanechnikov kernel */
export function epanechnikov(x: number) {
  return Math.max(0, 0.75 * (1 - (x * x)));
}

/**
 * Determine a kernel bandwidth based on Silverman's (1986)
 * rule of thumb. Assumes the underlying density being estimated
 * is gaussian.
 */
export function silvermansRule(std: number, n: number, iqr?: [lo: number, hi: number]) {
  const k = n ** (-1 / 5);

  return iqr ?
      // The lower of std and iqr
      1.06 * Math.min(std, (iqr[1] - iqr[0]) / 1.34) * k
    : 1.06 * std * k;
}

/**
 * Determine a kernel bandwidth based on:
 *   Robust and efficient estimation of the mode of continuous
 *   data: the mode as a viable measure of central tendency
 *     - D. Bickel
 * 
 * Like Silverman's rule of thumb, but more robust to outliers
 */
export function silvermanBickelRule(std: number, n: number, mad: MADResult) {
  const k = n ** (-1 / 5);
  return 0.9 * Math.min(std, mad.normMad) * k
}

/**
 * Finds an optimized kernel bandwidth for the given sample using cross-validation.
 * Assumes a gaussian kernel.
 */
export function cvBandwidth(
  sample: Indexable<number>,
  std: number,
) {
  // initial bandwidth estimate
  const h1 = silvermansRule(std, sample.length);

  // Min/eps
  // TODO - review
  const min = 1e-7 + (h1 / 1000);

  // Optimized bandwidth which minimizes the MISE
  // Assumes the initial guess overestimates the optimum
  // bandwidth, which is very typical. 
  const hRange = math.gss(
    h => mise(sample, h), min, h1 / 2, min, 100
  );

  return (hRange[0] + hRange[1]) / 2;
}

/**
 * @param kernel The kernel function
 * @param h Kernel smoothing parameter (bandwidth)
 *
 * @returns The kernel density estimation of the given
 * sample at the given location, x.
 */
export function estimate(
  kernel: Kernel,
  sample: Indexable<number>,
  h: number,
  x: number
) {
  const n = sample.length;
  const hNorm = 1 / h;
  const kNorm = 1 / (n * h);

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += kNorm * kernel(hNorm * (sample[i] - x));
  }

  return sum;
}

/**
 * A cost function for selection of a gaussian kernel bandwidth by
 * least squares cross-validation. References: Rudemo (1982),
 * Stone (1984) and Bowman (1984)
 *
 * @returns The mean integrated squared error (MISE) of the resulting
 * density es­timate of the given sample and bandwidth, h.
 */
export function mise(sample: Indexable<number>, h: number): number {
  const hNorm = 1 / h;
  const n = sample.length;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const xi = sample[i];

    for (let j = i + 1; j < n; j++) {
      const x = (xi - sample[j]) * hNorm;
      sum += 4 * PI_SQRT * (gaussianHat(x) - 2 * gaussian(x));
    }
  }

  return (n + sum) / h;
}

/**
 * A cost function for Maximum likelihood cross-validation
 * of a density estimate
 */
export function mlcv(kernel: Kernel, sample: Indexable<number>, h: number) {
  const n = sample.length;
  const hNorm = 1 / h;

  let cvSum = 0;
  for (let i = 0; i < n; i++) {
    const xi = sample[i];

    let q = 0;
    for (let j = 0; j < n; j++) {
      q += kernel(hNorm * (sample[j] - xi));
    }

    cvSum += Math.log(q - kernel(0));
  }

  return (1 / n) * cvSum - Math.log((n - 1) * h);
}

/**
 * Empirical probability density function mode (EPDFM)
 *
 * Finds the index of the sample with the highest density. When encountering a tie,
 * the lowest x value is selected
 *
 * @param kernel
 * @param sample
 * @param h Kernel smoothing parameter (bandwidth)
 */
export function findMaxima(
  kernel: Kernel, sample: Indexable<number>, h: number, eps = Number.EPSILON
): [index: number, density: number, ties: number] {
  let maxD = -Infinity,
      maxi = -1,
      ties = 0; 

  for (let i = 0; i < sample.length; i++) {
    const d = estimate(kernel, sample, h, sample[i]);

    if (d - maxD > eps) {
      // new Maximum
      maxi = i;
      maxD = d;
      ties = 0;
    } else if (maxD - d <= eps) {
      // tie
      ties++;

      if (sample[maxi] > sample[i]) {
        // select the lower x
        maxi = i;        
      }
    }
  }

  return [maxi, maxD, ties];
}

/**
 * Performs a simple conflation of several samples with their associated
 * kernel bandwidth.
 * 
 * See: An Optimal Method to Combine Results from Different Experiments
 *  - Theodore P. Hill and Jack Miller
 * 
 * https://arxiv.org/ftp/arxiv/papers/0901/0901.4957.pdf
 *
 * @returns The location of observation with the maximum probability density 
 */
export function findConflationMaxima(
  kernel: Kernel,
  samples: [raw: Indexable<number>, h: number][],
  eps = 0
): [x: number, density: number, ties: number] {
  let maxD = -Infinity,
      maxX = -1,
      ties = 0; 

  for (const [s] of samples) {
    // For each x in each sample, calculate the conflation at that point
    for (let i = 0; i < s.length; i++) {
      const x = s[i];
      let xConv = 0;
      
      for (let j = 0; j < samples.length; j++) {
        const [s2, h2] = samples[j];
        const d = estimate(kernel, s2, h2, x) * s2.length;

        xConv += d;
      }

      if (xConv - maxD > eps) {
        // new Maximum
        maxX = x;
        maxD = xConv;
        ties = 0;
      } else if (maxD - xConv <= eps) {
        // tie
        ties++;
  
        if (maxX > x) {
          // select the lower x
          maxX = x;        
        }
      }
    }
  }

  return [maxX, maxD, ties];
}

/**
 * Full width at half maximum (FWHM)
 * See: https://en.wikipedia.org/wiki/Full_width_at_half_maximum
 *
 * @param expectedValue The local/global maximum
 * @param h Kernel smoothing parameter (bandwidth)
 */
export function fwhm(
  kernel: Kernel,
  sample: Indexable<number>,
  expectedValue: number,
  h: number,
) {
  // sort by value
  sort(sample);

  // locate the index of the expectedValue
  let midIdx = lowerBound(sample, expectedValue, (a, val) => a < val);

  if (midIdx >= sample.length) {
    // set location to the last observation
    midIdx = sample[sample.length - 1];
  }

  const density = (x: number) => estimate(kernel, sample, h, x);
  const pHalf = .5 * density(sample[midIdx]);

  let lo = midIdx,
      hi = midIdx;

  while (lo > 0) {
    if (density(sample[--lo]) <= pHalf) { break; }
  }

  while (hi < sample.length - 1) {
    if (density(sample[++hi]) <= pHalf) { break; }
  }

  return {
    /** The half-maximum interval */
    range: [sample[lo], sample[hi]] as [number, number],

    /** Number of elements in the interval */
    length: hi - lo + 1,

    /**
     * The standard deviation in the interval,
     * assuming it is a normal distribution
     */
    std: (sample[hi] - sample[lo]) / 2.355
  };
}
