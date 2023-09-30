import R from './ReservoirSample.js';
import * as OS from './OnlineStats.js';

describe('ReservoirSample', () => {
  test('principal', () => {
    const sample = new R(10);
    const stats = new OS.Gaussian();

    for (let i = 0; i < 1000; i++) {
      sample.push(i);
      stats.push(i);
    }

    expect(sample.count).toBe(1000);
    expect(sample.N()).toBe(10);
    expect(stats.mean()).toBeGreaterThan(498);
    expect(stats.mean()).toBeLessThan(502);
    expect(stats.skewness()).toBeCloseTo(0, 3);
    expect(stats.std()).toBeCloseTo(Math.sqrt((1 / 12) * Math.pow(1000, 2)), 3)
  });

  test('Fills, resets reservoir', () => {
    const sample = new R(5);
    for (let i = 0; i < 5; i++) { expect(sample.push(i)).toBe(false); }
    
    expect(sample.count).toBe(5);
    expect(sample.N()).toBe(5);
    expect(sample.values).toEqual([0, 1, 2, 3, 4]);

    sample.reset();

    expect(sample.count).toBe(0);
    expect(sample.N()).toBe(0);
    expect(sample.values).toEqual([]);
  });
});
