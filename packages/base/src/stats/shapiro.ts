import { ArrayView, sort } from '../array.js';
import { assert } from '../index.js';
import { ppf } from './normal.js';

const EPSILON = 1e-19;

/* polynomial coefficients */
const g = [-2.273, 0.459];
const c1 = [0.0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
const c2 = [0.0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
const c3 = [0.544, -0.39978, 0.025054, -6.714e-4];
const c4 = [1.3822, -0.77857, 0.062767, -0.0020322];
const c5 = [-1.5861, -0.31082, -0.083751, 0.0038915];
const c6 = [-0.4803, -0.082676, 0.0030302];

/**
 * Perform the Shapiro-Wilk test for normality on the given sample.
 * The Shapiro-Wilk test tests the null hypothesis that the data was drawn
 * from a normal distribution.
 *
 * The sample size must be >= 3 && < 5000, and the range of the sample must be > 1e-19.
 *
 * @returns A statistic (W) which
 */
export function shapiroWilk(xs: ArrayView<number>): { statistic: number; pValue: number } {
  const n = xs.length;

  assert.gte(n, 3, 'The sample must have more than 2 elements.');
  assert.lte(n, 5000, 'The sample must have less or equal to 5000 elements.');

  sort(xs);

  const nn2 = Math.floor(n / 2);
  const as = new Float64Array(nn2 + 1); /* 1-based */

  /*    
    ALGORITHM AS R94 APPL. STATIST. (1995) vol.44, no.4, 547-551.
    Calculates the Shapiro-Wilk W test and its significance level
  */
  let pw: number;
  let an = n;

  if (n === 3) {
    as[1] = Math.SQRT1_2;
  } else {
    const an25 = an + 0.25;
    let summ2 = 0.0;

    for (let i = 1; i <= nn2; i++) {
      as[i] = ppf((i - 0.375) / an25); // p(X <= x),
      summ2 += as[i] * as[i];
    }

    summ2 *= 2.0;

    const ssumm2 = Math.sqrt(summ2);
    const rsn = 1.0 / Math.sqrt(an);
    const a1 = poly(c1, 6, rsn) - as[1] / ssumm2;

    let i1, fac;

    /* Normalize as[] */
    if (n > 5) {
      i1 = 3;
      const a2 = -as[2] / ssumm2 + poly(c2, 6, rsn);
      fac = Math.sqrt(
        (summ2 - 2.0 * (as[1] * as[1]) - 2.0 * (as[2] * as[2])) /
          (1.0 - 2.0 * (a1 * a1) - 2.0 * (a2 * a2)),
      );
      as[2] = a2;
    } else {
      i1 = 2;
      fac = Math.sqrt((summ2 - 2.0 * (as[1] * as[1])) / (1.0 - 2.0 * (a1 * a1)));
    }

    as[1] = a1;
    for (let i = i1; i <= nn2; i++) as[i] /= -fac;
  }

  /* Check for zero range */

  const range = xs[n - 1] - xs[0];
  assert.gt(range, EPSILON, 'The range of the sample is too small');

  /* Check for correct sort order on range - scaled X */

  let xx = xs[0] / range;
  let sx = xx;
  let sa = -as[1];

  for (let i = 1, j = n - 1; i < n; j--) {
    const xi = xs[i] / range;
    assert.lt(xx - xi, EPSILON, 'The xx - xi is too big.');

    sx += xi;
    i++;

    if (i != j) sa += sign(i - j) * as[Math.min(i, j)];

    xx = xi;
  }

  /* Calculate W statistic as squared correlation
   * between data and coefficients */
  sa /= n;
  sx /= n;

  let asa, ssa, sax, ssx, xsx;
  ssa = ssx = sax = 0;

  for (let i = 0, j = n - 1; i < n; i++, j--) {
    asa = i !== j ? sign(i - j) * as[1 + Math.min(i, j)] - sa : -sa;

    xsx = xs[i] / range - sx;
    ssa += asa * asa;
    ssx += xsx * xsx;
    sax += asa * xsx;
  }

  /* W1 equals (1-W) calculated to avoid excessive rounding error
   * for W very near 1 (a potential problem in very large samples) */

  const ssassx = Math.sqrt(ssa * ssx);
  const w1 = ((ssassx - sax) * (ssassx + sax)) / (ssa * ssx);
  const w = 1.0 - w1;

  /* Calculate significance level for W */

  if (n === 3) {
    /* exact P value : */
    const pi6 = 6.0 / Math.PI; /* 1.90985931710274 = 6/pi */
    const stqr = Math.PI / 3.0; /* 1.04719755119660 = asin(sqrt(3/4)) */

    pw = pi6 * (Math.asin(Math.sqrt(w)) - stqr);
    if (pw < 0) pw = 0;

    return { statistic: w, pValue: pw };
  }

  let m, s;
  let y = Math.log(w1);

  xx = Math.log(an);

  if (n <= 11) {
    const gamma = poly(g, 2, an);

    if (y >= gamma) {
      pw = 1e-99; /* an "obvious" value, was 'small' which was 1e-19f */
      return { statistic: w, pValue: pw };
    }

    y = -Math.log(gamma - y);
    m = poly(c3, 4, an);
    s = Math.exp(poly(c4, 4, an));
  } else {
    /* n >= 12 */
    m = poly(c5, 4, xx);
    s = Math.exp(poly(c6, 3, xx));
  }

  pw = alnorm((y - m) / s);
  return { statistic: w, pValue: pw };
}

function poly(cc: number[], nord: number, x: number) {
  /* Algorithm AS 181.2    Appl. Statist.    (1982) Vol. 31, No. 2
   * Calculates the algebraic polynomial of order nord-1 with array of coefficients cc.
   * Zero order coefficient is cc(1) = cc[0] */

  let result = cc[0];
  if (nord > 1) {
    let p = x * cc[nord - 1];
    for (let j = nord - 2; j > 0; --j) p = (p + cc[j]) * x;
    result += p;
  }

  return result;
}

function sign(x: number): number {
  return x === 0 ? 0 : x > 0 ? 1 : -1;
}

function alnorm(x: number) {
  let up = true;

  if (x < 0.0) {
    up = false;
    x = -x;
  }

  let alnorm = 0.0;
  if (x <= 7.0 || (up && x <= 18.66)) {
    const y = 0.5 * x * x;
    if (x > 1.28) {
      // prettier-ignore
      alnorm = 0.398942280385 * Math.exp(-y) / (x + -3.8052E-8 + 1.00000615302 / (x + 3.98064794E-4 + 1.98615381364 / (x + -0.151679116635 + 5.29330324926 / (x + 4.8385912808 + -15.1508972451 / (x + 0.742380924027 + 30.789933034 / (x + 3.99019417011))))));
    } else {
      // prettier-ignore
      alnorm = 0.5 - x * (0.398942280444 - 0.39990348504 * y / (y + 5.75885480458 + -29.8213557807 / (y + 2.62433121679 + 48.6959930692 / (y + 5.92885724438))));
    }
  }

  return up ? alnorm : 1 - alnorm;
}
