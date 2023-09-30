import * as intervals from './intervals.js';

describe('intervals', () => {
  /** @see https://www.tandfonline.com/doi/pdf/10.1080/10691898.2005.11910638 3.3 */
  test('lognormal95', () => {
    const logMean = 5.127,
          variance = 1.010,
          n = 40;

    const [lo, hi] = intervals.logNormal95(
      logMean, variance, n
    );

    expect(lo).toBeCloseTo(190.24, 2);
    expect(hi).toBeCloseTo(409.82, 2);
  });
});
