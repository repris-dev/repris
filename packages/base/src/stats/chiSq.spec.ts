import * as chiSq from './chiSq.js';

describe('lowRegGamma', () => {
  /**
   * import scipy.special as sc
   * sc.gammainc(0.5, [0, 1, 10, 100])
   */
  test('values', () => {
    expect(chiSq.lowRegGamma(0.5, 0)).toBe(0);
    expect(chiSq.lowRegGamma(0.5, 1)).toBeCloseTo(0.8427, 3);
    expect(chiSq.lowRegGamma(0.5, 10)).toBeCloseTo(0.9999, 3);
    expect(chiSq.lowRegGamma(0.5, 100)).toBe(1);
  });
});
