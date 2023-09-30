/**
 * Approximate cumulative distribution function for the normal distribution.
 * From Hastings (1955), Approximations for Digital Computers
 */
export function cdf(x: number, mean = 0, std = 1) {
  const z = (x - mean) / std,
        t = 1 / (1 + .2316419 * Math.abs(z)),
        d = .3989423 * Math.exp(-z * z / 2),
        prob = d * t * (.3193815 + t * ( -.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  return z > 0 ? 1 - prob : prob;
}