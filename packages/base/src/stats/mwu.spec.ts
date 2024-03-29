import { iota } from '../array.js';
import { gss } from '../math.js';
import { kruskalWallis, mwu } from './mwu.js';
import { median } from './util.js';

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

describe('kruskalWallis', () => {
  const x = [
    [2.9, 3.0, 2.5, 2.6, 3.2],
    [3.8, 2.7, 4.0, 2.4],
    [2.8, 3.4, 3.7, 2.2, 2.0],
  ];

  /**
   * from scipy import stats
   * stats.kruskal(x)
   */
  test('3 samples, no ties', () => {
    const result = kruskalWallis(x);

    expect(result.H).toBeCloseTo(0.77143, 4);
    expect(result.effectSize).toBeCloseTo(0.0593, 4);
    expect(result.pValue()).toBeCloseTo(0.67995, 4);
  });

  /**
   * import scikit_posthocs as sp
   * sp.posthoc_dunn(x, p_adjust='bonferroni')
   */
  test('3 samples, no ties - Dunns test (adjusted)', () => {
    // prettier-ignore
    const expectedPs = [
      1,     0.890, 0.994,
      0.890, 1,     0.776,
      0.994, 0.776, 1,
    ];

    // prettier-ignore
    const expectedEs = [
      0,     0.214, 0.072,
      0.214, 0,     0.285,
      0.072, 0.285, 0,
    ]

    const result = kruskalWallis(x);
    const pVals = [] as number[];
    const esVals = [] as number[];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const { p, effectSize } = result.dunnsTest(i, j, true);
        pVals.push(+p.toFixed(3));
        esVals.push(+effectSize.toFixed(3));
      }
    }

    expect(pVals).toEqual(expectedPs);
    expect(esVals).toEqual(expectedEs);
  });

  test('3 samples, ties', () => {
    const result = kruskalWallis([
      [1, 1, 1],
      [2, 2, 2],
      [2, 2],
    ]);

    expect(result.H).toEqual(7);
    expect(result.effectSize).toEqual(1);
    expect(result.pValue()).toBeCloseTo(0.03019, 4);
  });

  test('2 samples, ties, repeats', () => {
    const result = kruskalWallis([
      [0, 1, 1, 3],
      [0, 1, 2, 6],
    ]);

    expect(result.H).toBeCloseTo(0.19937, 4);
    expect(result.effectSize).toBeCloseTo(0.02848, 4);
    expect(result.pValue()).toBeCloseTo(0.65523, 4);
  });

  test('4 samples, ties, repeats', () => {
    const result = kruskalWallis([
      [0, 1, 1, 3],
      [1, 2, 3, 6],
      [0, 1, 2, 6],
      [0, 3, 3, 8],
    ]);

    expect(result.H).toBeCloseTo(2.1502, 4);
    expect(result.effectSize).toBeCloseTo(0.1433, 4);
    expect(result.pValue()).toBeCloseTo(0.5418, 4);
  });

  test('2 samples, separated', () => {
    const result = kruskalWallis([
      [5, 4, 3, 2, 1],
      [10, 9, 8, 7, 6],
    ]);

    expect(result.effectSize).toBeGreaterThan(0.5);
    expect(result.dunnsTest(0, 1).effectSize).toBeGreaterThan(0.8);
  });

  test('3 samples, identical', () => {
    const result = kruskalWallis([
      [3, 3, 3],
      [3, 3, 3],
      [3, 3, 3],
    ]);

    expect(result.H).toEqual(0);
    expect(result.effectSize).toEqual(0);
    expect(result.pValue()).toEqual(1);
  });

  test('3 samples, 1 observation', () => {
    // note sample sizes less than 5 are not ideal
    const result = kruskalWallis([[1], [2], [3]]);

    expect(result.H).toEqual(2);
    expect(result.effectSize).toEqual(1);
  });

  test('ranking', () => {
    const result = kruskalWallis([
      [3, 4, 6, 5, 1, 6, 6],
      [2, 2, 5, 4, 2],
      [7, 21, 18],
    ]);

    const order = iota(new Array(3), 0).sort((a, b) => result.ranks[a] - result.ranks[b]);
    expect(order).toEqual([1, 0, 2]);
  });

  test('effect-size test', () => {
    const data = [
      509, 609, 710, 710, 710, 710, 710, 710, 710, 710, 710, 710, 711, 711, 711, 711, 711, 711, 711,
      711, 711, 712, 712, 713,

      853, 854, 865, 865, 866, 868, 911, 870, 865, 864, 862, 862, 867, 869, 864, 862, 862, 967, 969,
      862, 862, 967, 969,
    ];

    const m = median(data);
    let sensitivity = 0.005;

    // the smallest effect-size which is statistically significant at the given
    // sensitivity.
    const mde = gss(
      es => {
        const result = kruskalWallis([data, data.map(x => x + es)]);
        return (result.pValue() - sensitivity) ** 2;
      },
      m * 0.001,
      m * 0.5,
      m * 0.001,
      100,
    );

    expect(mde[0]).toBeInRange(5.75, 6.25);
    expect(mde[1]).toBeInRange(6.25, 6.5);
  });
});
