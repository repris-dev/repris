import { gte, is } from './assert.js';
import { assert } from './index.js';

/**
 * Divide a (positive) bigint by the given divisor rounded to the nearest integer
 *
 * For example:
 * ```
 * 3n / 2n; // 1n
 * divRounded(3, 2); // 2n
 * ```
 */
export function divRounded(dividend: bigint, divisor: bigint): bigint {
  is(divisor !== 0n);
  gte(dividend, 0n);

  return (dividend + divisor / 2n) / divisor;
}

const invphi = (Math.sqrt(5) - 1) / 2; // 1 / phi
const invphi2 = (3 - Math.sqrt(5)) / 2; // 1 / phi^2

/**
 * Golden-section search
 * Finds the minimum of a uni-modal function within a specified interval
 * @see https://en.wikipedia.org/wiki/Golden-section_search
 *
 * @param f A uni-modal function to evaluate X
 * @param a Lower bound of the search interval
 * @param b Upper bound of the search interval
 * @param tol Minimum interval width
 * @param maxIter (optional) restrict the maximum iterations
 *
 * @returns The interval where f(X) is minimized
 */
export function gss(
  f: (x: number) => number,
  a: number,
  b: number,
  tol: number,
  maxIter?: number,
): [number, number] {
  assert.gt(tol, Number.EPSILON);

  [a, b] = [Math.min(a, b), Math.max(a, b)];

  let h = b - a;
  if (h <= tol) return [a, b];

  // Required steps to achieve tolerance
  let n = Math.ceil(Math.log(tol / h) / Math.log(invphi));

  if (Number.isFinite(maxIter) && n > maxIter!) {
    assert.gt(maxIter, 0);
    n = Math.min(n, maxIter!);
  }

  let c = a + invphi2 * h;
  let d = a + invphi * h;
  let yc = f(c);
  let yd = f(d);

  while (n-- > 0) {
    h = invphi * h;

    if (yc < yd) {
      b = d;
      d = c;
      yd = yc;
      c = a + invphi2 * h;
      yc = f(c);
    } else {
      a = c;
      c = d;
      yc = yd;
      d = a + invphi * h;
      yd = f(d);
    }
  }

  return yc < yd ? [a, d] : [c, b];
}

export function lerp(x1: number, x2: number, alpha: number) {
  assert.inRange(alpha, 0, 1);

  return x1 * (1 - alpha) + x2 * alpha;
}
