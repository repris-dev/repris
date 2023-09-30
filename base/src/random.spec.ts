import * as random from './random.js';
import * as OS from './stats/OnlineStats.js';

describe('random', () => {
  test('normal distribution (1)', () => {
    const rng = random.gaussian(10, 1, random.PRNGi32(31));
    const stats = new OS.Gaussian();

    for (let i = 0; i < 5000; i++) {
      stats.push(rng());
    }

    expect(stats.mean()).toBeCloseTo(10, 1);
    expect(stats.std()).toBeCloseTo(1, 1);
    expect(stats.kurtosis()).toBeCloseTo(0, 1);
    expect(stats.skewness()).toBeCloseTo(0, 2);
  });

  test('normal distribution (2)', () => {
    const rng = random.gaussian(5, 5, random.PRNGi32(52));
    const stats = new OS.Gaussian();

    for (let i = 0; i < 5000; i++) {
      stats.push(rng());
    }

    expect(stats.mean()).toBeCloseTo(5, 0.33);
    expect(stats.std()).toBeCloseTo(5, 1);
    expect(stats.kurtosis()).toBeCloseTo(0, 1);
    expect(stats.skewness()).toBeCloseTo(0, 1);
  });
});
