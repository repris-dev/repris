import * as math from './math.js';

test('divRounded()', () => {
  expect(math.divRounded(3n, 2n)).toBe(2n);
  expect(math.divRounded(1500n, 1000n)).toBe(2n);
  expect(math.divRounded(0n, 2n)).toBe(0n);
  expect(math.divRounded(4n, 2n)).toBe(2n);
  expect(math.divRounded(4n, 4n)).toBe(1n);
});

describe('gss', () => {
  test('finds min', () => {
    const f = (x: number) => Math.cos(x) * x;
    const r = math.gss(f, -3.5, 1, 1e-7, 100);

    const min = (r[0] + r[1]) / 2;
    expect(min).toBeCloseTo(-0.86, 3);
  });
});

describe('lerp', () => {
  test('alpha = 0', () => {
    expect(math.lerp(3, 4, 0)).toBe(3);
    expect(math.lerp(4, 3, 0)).toBe(4);
  });

  test('alpha = 0.5', () => {
    expect(math.lerp(3, 4, 0.5)).toBe(3.5);
    expect(math.lerp(4, 3, 0.5)).toBe(3.5);
  });

  test('alpha = 1', () => {
    expect(math.lerp(3, 4, 1)).toBe(4);
    expect(math.lerp(4, 3, 1)).toBe(3);
  });
});
