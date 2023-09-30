import { Gaussian } from './OnlineStats.js';

describe('OnlineStats', () => {
  test('3 values', () => {
    const stats = new Gaussian();
    expect(stats.N()).toBe(0);

    stats.push(1);
    expect(stats.N()).toBe(1);
    expect(stats.mean()).toBe(1);
    expect(stats.range()).toEqual([1, 1]);

    stats.push(2);
    expect(stats.N()).toBe(2);
    expect(stats.mean()).toBe(1.5);
    expect(stats.range()).toEqual([1, 2]);

    stats.push(3);
    expect(stats.N()).toBe(3);
    expect(stats.mean()).toBe(2);
    expect(stats.std()).toBeCloseTo(0.8165, 4);
    expect(stats.cov()).toBeCloseTo(0.4082, 4);
    expect(stats.skewness()).toBe(0);
    expect(stats.kurtosis()).toBe(-1.5);
    expect(stats.range()).toEqual([1, 3]);
  });

  test('positive skew', () => {
    const stats = new Gaussian();

    // positive skew
    [1, 1, 1, 1, 2, 3, 4].forEach(x => stats.push(x));

    expect(stats.kurtosis()).toBeCloseTo(-0.7736, 3);
    expect(stats.skewness()).toBeCloseTo(0.8849, 4);
  });

  test('normal distribution', () => {
    const stats = new Gaussian();

    // approximately normal
    [1, 1.5, 2, 2, 2, 2, 2, 2.5, 3].forEach(x => stats.push(x));

    expect(stats.kurtosis()).toBeCloseTo(0.06, 4);
    expect(stats.skewness()).toBeCloseTo(0, 4);
  });
});
