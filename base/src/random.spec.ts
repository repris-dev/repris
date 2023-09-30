import * as random from './random.js';
import * as OS from './stats/OnlineStats.js';

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
