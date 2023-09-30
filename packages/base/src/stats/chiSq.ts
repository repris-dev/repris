/** Chi-squared cumulative distribution function. */
export function cdf(x: number, dof: number) {
  if (x < 0) return 0;
  return lowRegGamma(dof / 2, x / 2);
}

/**
 * @returns The lower regularized incomplete gamma function evaluated at `(a,x)`.
 * It is defined as the quotient of the lower incomplete gamma function evaluated
 * at (a, x) and the upper incomplete gamma function ('the gamma function')
 * evaluated at (a).
 *
 * This function is usually written as P(x, a); and is one of the two
 * [regularized gamma functions](http://mathworld.wolfram.com/RegularizedGammaFunction.html).
 *
 * This function is tested against gammainc(x, a)'s 'reginc' output from the
 * 'pracma' library for R. Note that R and jStat switch the order of operators
 * for this function.
 * 
 * Reference: [jStat](https://jstat.github.io/index.html)
 */
export function lowRegGamma(a: number, x: number) {
  const aln = gammaln(a);

  let ap = a;
  let sum = 1 / a;
  let del = sum;
  let b = x + 1 - a;
  let c = 1 / 1.0e-30;
  let d = 1 / b;
  let h = d;
  let i = 1;

  // calculate maximum number of iterations required for a
  const ITMAX = -~(Math.log(a >= 1 ? a : 1 / a) * 8.5 + a * 0.4 + 17);  

  if (x < 0 || a <= 0) {
    return NaN;
  }
  
  if (x < a + 1) {
    for (; i <= ITMAX; i++) {
      sum += del *= x / ++ap;
    }

    return sum * Math.exp(-x + a * Math.log(x) - aln);
  }

  for (; i <= ITMAX; i++) {
    const an = -i * (i - a);

    b += 2;
    d = an * d + b;
    c = b + an / c;
    d = 1 / d;
    h *= d * c;
  }

  return 1 - h * Math.exp(-x + a * Math.log(x) - aln);
}

/** Returns the Log-Gamma function evaluated at x. */
function gammaln(x: number) {
  const cof = [
     76.18009172947146,
    -86.50532032941677,
     24.01409824083091,
    -1.231739572450155,
     0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];

  let ser = 1.000000000190015;
  let xx, y;

  let tmp = (y = xx = x) + 5.5;
  tmp -= (xx + 0.5) * Math.log(tmp);

  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;

  return Math.log((2.5066282746310005 * ser) / xx) - tmp;
}
