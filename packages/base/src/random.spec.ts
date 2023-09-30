import * as random from './random.js';
import * as OS from './stats/OnlineStats.js';
import { uuid } from './util.js';

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

test('uniform distribution', () => {
  const entropy = random.PRNGi32(571),
    rng = random.uniform(1, 3, entropy);

  const stats = new OS.Gaussian();
  for (let i = 0; i < 1e5; i++) {
    stats.push(rng());
  }

  const r = stats.range();
  expect(r[0]).toBeGreaterThanOrEqual(1);
  expect(r[1]).toBeLessThan(3);
  expect(stats.mean()).toBeInRange(1.99, 2.01);
  expect(stats.skewness()).toBeInRange(-0.01, 0.01);
});

test('uniformi distribution', () => {
  const entropy = random.PRNGi32(951),
    rng = random.uniformi(0, 9, entropy);

  const histogram = new Int32Array(10),
    N = 1e5;

  for (let i = 0; i < N; i++) {
    const x = rng();
    expect(Math.floor(x)).toBe(x);
    expect(x).toBeInRange(0, 9);
    histogram[x]++;
  }

  let tot = 0;
  const val = N / 10,
    tol = val * 0.05;

  for (const k of histogram) {
    expect(k).toBeInRange(val - tol, val + tol);
    tot += k;
  }

  expect(tot).toBe(N);
});

describe('discreteDistribution', () => {
  const weights = [100, 50, 1, 0];

  test('Biased towards selecting outliers', () => {
    const entropy = random.PRNGi32(571);
    const counts = new Int32Array(weights.length);
    const rng = random.discreteDistribution(weights, entropy);

    for (let index = 0; index < 10_000; index++) {
      const x = rng();
      expect(x).toBeInRange(0, 3);
      expect(x).toEqual(Math.round(x));
      counts[x]++;
    }

    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[3]).toEqual(0);
  });
});

describe('newUuid', () => {
  test('seeded', () => {
    const entropy1 = random.PRNGi32(91);
    expect(random.newUuid(entropy1)).toBe('5356efa2-3a47-4296-950c-cdbe5cc938c4');
    expect(random.newUuid(entropy1)).toBe('9e80c283-edaa-49ce-b301-47f58f247e1e');

    const entropy2 = random.PRNGi32(72);
    expect(random.newUuid(entropy2)).toBe('6bd05bf4-4e7e-45b3-89db-1c4d87eb52de');
    expect(random.newUuid(entropy2)).toBe('e884c14a-96a3-43a4-bb2c-7045d172a34f');
  });

  test('unseeded', () => {
    const set = new Set<uuid>();

    for (let i = 0; i < 100; i++) {
      const uuid = random.newUuid();
      expect(set.has(uuid)).toBeFalsy();
      set.add(uuid);
    }
  });
});
