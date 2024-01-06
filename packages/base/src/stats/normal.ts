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
 * Returns the minimum detectable effect size (MDES) at the given sensitivity and
 * power level in a hypothetical two sided hypothesis test with a sample defined
 * by the given size and standard deviation.
 * 
 * @reference fundamentals of Biostatistics, Bernard Rosner - Equation 8.25
 *
 * @param a - desired significance level in a two-tailed test (e.g., for α = 0.05, Z1−α2≈1.96)
 * @param b - desired statistical power
 * @param n - sample size
 * @param std - sample standard deviation
 * @param p - Proportion of the sample in the treatment group
 */
export function mde(a: number, b: number, n: number, std: number, p = 0.5) {
  const Za = ppf((1 - a) / 2);
  const Zb = ppf(1 - b);

  return Math.abs(Za + Zb) * Math.sqrt((std * std) / n) * Math.sqrt(1 / (p * (1 - p)));
}
