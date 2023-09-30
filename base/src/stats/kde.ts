import { Indexable } from "../util.js";

// @ts-check
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

/**
 * Determine a kernel bandwidth based on Silverman's (1986)
 * rule of thumb. Assumes the underlying density being estimated
 * is gaussian.
 */
export function silvermansRule(std: number, n: number, iqr?: [lo: number, hi: number]) {
  const k = n ** (-1 / 5);

  return iqr ?
      (1.06 * Math.min(std, (iqr[1] - iqr[0]) / 1.34)) * k
    : (1.06 * std) * k;
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
 * Finds the index of the sample with the highest density,
 * and count the number of ties of that density.
 * 
 * @param kernel 
 * @param sample 
 * @param h Kernel smoothing parameter (bandwidth)
 */
export function findMaxima(
  kernel: Kernel, sample: Indexable<number>, h: number
): [index: number, density: number, count: number] {
  let maxD = -Infinity,
      maxi = -1,
      ties = 0;

  for (let i = 0; i < sample.length; i++) {
    const d = estimate(kernel, sample, h, sample[i]);

    if (d > maxD) {
      maxi = i;
      maxD = d;
      ties = 0;
    } else if (maxD - d < 1e-6) {
      ties++;
    }
  }

  return [maxi, maxD, ties];
}
