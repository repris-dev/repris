import { mwu } from './mwu.js';

describe('mwu', () => {
  test('simple ranks', () => {
    const treated = [4, 2, 3, 1];
    const untreated = [5, 6, 7];

    const result1 = mwu(treated, untreated);
    expect(result1.effectSize).toEqual(1);

    const result2 = mwu(untreated, treated);
    expect(result2.effectSize).toEqual(0);
  });

  test('empty', () => {
    const result = mwu([], []);
    expect(result.u1).toEqual(0);
    expect(result.u1).toEqual(0);
  });

  test('finds shared ranks', () => {
    const a = [1, 20, 3, 4, 52];
    const b = [1, 20, 3, 4, 52];

    const result = mwu(a, b);
    expect(result.effectSize).toEqual(0.5);
  });

  test('finds ranks', () => {
    const a = [540, 670, 1000, 960, 1200, 4650, 4200];
    const b = [7500, 1300, 900, 4500, 5000, 6100, 7400];

    const result = mwu(a, b);
    expect(result.u1).toEqual(41);
    expect(result.u2).toEqual(8);
  });

  test('finds ranks (2)', () => {
    const a = [30, 14, 6, 11, 88, 1, 3, 7];
    const b = [12, 15, 16, 42, 9, 9, 30, 28];

    const result = mwu(a, b);
    expect(result.u1).toEqual(44.5);
    expect(result.u2).toEqual(19.5);
  });
});
