/**
 * Approximate cumulative distribution function for the normal distribution.
 * From Hastings (1955), Approximations for Digital Computers
 */
export function cdf(x: number, mean = 0, std = 1) {
  const z = (x - mean) / std,
    t = 1 / (1 + 0.2316419 * Math.abs(z)),
    d = 0.3989423 * Math.exp((-z * z) / 2),
    prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return z > 0 ? 1 - prob : prob;
}

/** A normal continuous random variable with given location/scale */
export function pdf(x: number, mean = 0, std = 1) {
  const m = std * Math.sqrt(2 * Math.PI);
  const e = Math.exp(-Math.pow(x - mean, 2) / (2 * (std * std)));
  return e / m;
}

function rationalApproximation(t: number): number {
  // Abramowitz and Stegun formula 26.2.23.
  // The absolute value of the error should be less than 4.5 e-4.
  const c = [2.515517, 0.802853, 0.010328];
  const d = [1.432788, 0.189269, 0.001308];
  const numerator = (c[2] * t + c[1]) * t + c[0];
  const denominator = ((d[2] * t + d[1]) * t + d[0]) * t + 1.0;

  return Number.isFinite(denominator) ? t - numerator / denominator : denominator;
}

/** Percent point function */
export function ppf(p: number): number {
  if (p < 0.5) {
    // F^-1(p) = - G^-1(p)
    return -rationalApproximation(Math.sqrt(-2.0 * Math.log(p)));
  } else {
    // F^-1(p) = G^-1(1-p)
    return rationalApproximation(Math.sqrt(-2.0 * Math.log(1.0 - p)));
  }
}

/**
 * Returns the minimum detectable effect (MDE) for two samples at the given sensitivity and
 * power level. See fundamentals of Biostatistics, Bernard Rosner - Equation 8.25
 *
 * @param a - desired significance level in a two-tailed test (e.g., for α = 0.05, Z1−α2≈1.96)
 * @param b - desired statistical power
 * @param n1 - first sample size
 * @param n2 - second sample size
 * @param std1 - first sample standard deviation
 * @param std2 - second sample standard deviation
 */
export function mde(a: number, b: number, n1: number, std1: number, n2: number, std2: number) {
  const Za = ppf((1 - a) / 2);
  const Zb = ppf(1 - b);

  const numerator = (Za + Zb) ** 2 * (std1 ** 2 + std2 ** 2);
  const mde1 = Math.sqrt(numerator / n1);
  const mde2 = Math.sqrt(numerator / n2);

  return (mde1 + mde2) / 2;
}
