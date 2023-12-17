import { pdf, cdf, ppf } from './normal.js';

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
