import { assert, Indexable } from '../index.js';


export type LMSResult = {
  /** The bounds of the sub-sample */
  bound: [lower: number, upper: number];

  /**
   * The estimation of the mode as the average
   * of either end of the bound
   */
  mode: number;

  /**
   * Number of ties encountered. The left-most bound is
   * returned when encountering a tie
   */
  ties: number;

  /** A coefficient of variation */
  variation: number;
}

function modalSearch(sample: Indexable<number>, windowSize: number) {
  assert.le(windowSize, sample.length);

  const n = sample.length;
  
  let minRange = Infinity,
      lo = 0,
      hi = n - 1,
      ties = 0;

  for (let i = 0; i < n - windowSize; i++) {
    const range = sample[i + windowSize] - sample[i];

    if (range < minRange) {
      minRange = range;
      lo = i;
      hi = i + windowSize;
      ties = 0;
    } else if (range - minRange < 1e-6) {
      ties++;
    }
  }

  return {
    range: [lo, hi], ties
  };
}

/**
 * Least Median of Squares.
 * Find the range of the shortest sub-sample of proportion alpha (.5 by default)
 * 
 * TODO: correct implementation for small samples (N=1-3)
 * 
 * See also:
 * https://arxiv.org/ftp/math/papers/0505/0505419.pdf
 */
export function lms(sample: Indexable<number>, alpha = .5): LMSResult {
  assert.gt(alpha, 0);
  assert.le(alpha, 1);

  // sort by duration
  Array.prototype.sort.call(sample, (a, b) => a - b);

  const n = sample.length,
        windowSize = Math.ceil(n * alpha),
        r = modalSearch(sample, windowSize);

  const [lodx, hidx] = r.range;
  assert.eq(hidx - lodx, windowSize);

  const midpoint = windowSize / 2;
  const mode = windowSize % 2 === 0
        ? (sample[midpoint - 1] + sample[midpoint]) / 2
        : sample[Math.floor(midpoint)];

  const variation = (sample[hidx] - sample[lodx]) / (sample[hidx] + sample[lodx]);

  return {
    bound: [sample[lodx], sample[hidx]],
    ties: r.ties,
    variation,
    mode
  };
}

export function shorth(sample: Indexable<number>, alpha = .5): LMSResult {
  assert.gt(alpha, 0);
  assert.le(alpha, 1);

  // sort by duration
  Array.prototype.sort.call(sample, (a, b) => a - b);

  const n = sample.length,
        windowSize = Math.ceil(n * alpha),
        r = modalSearch(sample, windowSize);

  const [lodx, hidx] = r.range;
  const lo = sample[lodx], hi = sample[hidx];

  let mean = 0, norm = 1 / (hidx - lodx);
  for (let i = lodx; i <= hidx; i++) {
    mean += norm * sample[i];
  }

  const variation = (sample[hidx] - sample[lodx]) / mean;

  return {
    bound: [lo, hi],
    variation,
    ties: r.ties,
    mode: mean,
  };
}
