export function normal95(mean: number, variance: number, n: number) {
  throw new Error('Not impl');
}

/**
 * Cox method (1971)
 *
 * References:
 *  - https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/conflimi.htm
 *  - https://www.tandfonline.com/doi/pdf/10.1080/10691898.2005.11910638
 *
 * @param mean The log-transformed arithmetic mean
 * @returns The 95% confidence interval for the mean of a log-normal distribution
 */
export function logNormal95(mean: number, std: number, n: number) {
  const z = 1.96;
  const m = Math.sqrt(std / n + std ** 2 / (2 * (n - 1)));

  const lo = mean + std / 2 - z * m;
  const hi = mean + std / 2 + z * m;

  return [Math.exp(lo), Math.exp(hi)];
}
