import { pdf, cdf, ppf, power } from './normal.js';

describe('pdf', () => {
  test('densities', () => {
    expect(pdf(0, 0, 1)).toBeCloseTo(0.398, 2);
    expect(pdf(1, 0, 1)).toBeCloseTo(0.241, 2);
    expect(pdf(-1, 0, 1)).toBeCloseTo(0.241, 2);
    expect(pdf(1, 1, 2)).toBeCloseTo(0.199, 2);
  });
});

describe('cdf', () => {
  test('probabilities', () => {
    expect(cdf(0, 0, 1)).toBeCloseTo(0.5, 2);
    expect(cdf(0.5, 0, 1)).toBeCloseTo(0.691, 2);
    expect(cdf(0.5, 3, 1)).toBeCloseTo(0.006, 2);
    expect(cdf(0.99, 0, 1)).toBeCloseTo(0.838, 2);
    expect(cdf(0.138)).toBeCloseTo(0.5548, 3.5);
  });
});

describe('ppf', () => {
  test('percentiles', () => {
    expect(ppf(0.5)).toBeCloseTo(0, 2);
    expect(ppf(0.691)).toBeCloseTo(0.5, 2);
    expect(ppf(0.006)).toBeCloseTo(-2.512, 2);
    expect(ppf(0.99)).toBeCloseTo(2.326, 2);
    expect(ppf(0.975)).toBeCloseTo(1.96, 2);
    expect(ppf(0)).toEqual(-Infinity);
    expect(ppf(1)).toEqual(Infinity);
  });
});

describe('power', () => {
  /**  Ref: Fundamentals of Biostatistics - 8th Edition */
  test('Example 8.28', () => {
    const alpha = 0.05;

    const n0 = 100;
    const mu0 = 120;
    const std0 = 15.34;

    const n1 = 100;
    const mu1 = 125;
    const std1 = 18.23;

    const p = power(alpha, mu0, mu1, n0, n1, std0, std1);
    expect(p).toBeCloseTo(.555, 4);
  });
})