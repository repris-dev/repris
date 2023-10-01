import { online as OS } from '../stats.js';
import * as random from '../random.js';
import * as util from './util.js';

describe('iqr', () => {
  /**
   * Equivalent:
   * ```py
   * import numpy as np
   * a = np.array([0, 2, 1, 4, 3,   5, 7, 6, 9, 8])
   * [np.percentile(a, 25), np.percentile(a, 75)]
   * ```
   *
   */
  test('finds range (even sample size)', () => {
    const arr = [0, 2, 1, 4, 3, 5, 7, 6, 9, 8];
    const range = util.iqr(arr);

    expect(range).toEqual([2.25, 6.75]);
  });

  test('finds range (odd sample size)', () => {
    const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const range = util.iqr(arr);

    expect(range).toEqual([2, 6]);
  });

  test('finds range (odd sample size)', () => {
    const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const range = util.iqr(arr);

    expect(range).toEqual([2, 6]);
  });

  test('finds range (N=1)', () => {
    const arr = [0];
    const range = util.iqr(arr);

    expect(range).toEqual([0, 0]);
  });
});

describe('median', () => {
  test('even sample size', () => {
    const arr = [0, 1, 2, 3];
    const m = util.median(arr);

    expect(m).toEqual(1.5);
  });

  test('even sample size (2)', () => {
    const arr = [100, 200];
    const m = util.median(arr);

    expect(m).toEqual(150);
  });

  test('odd sample size', () => {
    const arr = [0, 1, 2];
    const m = util.median(arr);

    expect(m).toEqual(1);
  });

  test('odd sample size (2)', () => {
    const arr = [100];
    const m = util.median(arr);

    expect(m).toEqual(100);
  });
});

describe('percentile', () => {
  test('Interpolates correctly', () => {
    const arr = [2, 0, 3, 1]; // 0, 1, 2, 3

    expect(util.quantile(arr, 0)).toEqual(0);
    expect(util.quantile(arr, 1)).toEqual(3);
    expect(util.quantile(arr, 0.5)).toEqual(1.5);
    expect(util.quantile(arr, 0.3333)).toBeCloseTo(1, 3);
    expect(util.quantile(arr, 0.6666)).toBeCloseTo(2, 3);
  });
});

describe('mad', () => {
  test('small sample', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    const { mad, normMad } = util.mad(arr);

    expect(mad).toEqual(2);
    expect(normMad).toBeCloseTo(2 * 1.4826, 2);
  });
});

describe('qcd', () => {
  test('qcd of a normal distribution', () => {
    const rng = random.gaussian(1000, 250, random.PRNGi32(41));
    const sample = new Float32Array(1e4);

    for (let i = 0; i < 1e4; i++) {
      sample[i] = rng();
    }

    const iqr = util.iqr(sample);
    const qcd = util.qcd(iqr);

    // std dev. = (mean * qcd) / 0.673
    expect((1000 * qcd) / 0.673).toBeInRange(245, 255);
  });
});

describe('jarqueBera', () => {
  const N = 1e3;

  test('normal distribution', () => {
    const rng = random.gaussian(5, 5, random.PRNGi32(52));
    const stats = new OS.Gaussian();

    for (let i = 0; i < N; i++) {
      stats.push(rng());
    }

    expect(util.jarqueBera(N, stats.skewness(1), stats.kurtosis(1), 1)).toBeLessThan(1);
  });

  test('uniform distribution', () => {
    const rng = random.uniform(0, 5, random.PRNGi32(52));
    const stats = new OS.Gaussian();

    for (let i = 0; i < N; i++) {
      stats.push(rng());
    }

    expect(util.jarqueBera(N, stats.skewness(), stats.kurtosis())).toBeGreaterThan(50);
  });
});
