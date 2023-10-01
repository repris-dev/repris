import { quickselect } from '../array.js';
import { assert, Indexable } from '../index.js';

export type RobustScale = {
  spread: number;
  correctedSpread: number;
};

function oneObservation(sample: Indexable<number>) {
  assert.eq(sample.length, 1);
  return {
    spread: 0,
    correctedSpread: 0,
  };
}

/**
 * Time-efficient algorithms for two highly robust estimators of scale
 * C. Croux and P. J. Rousseeuw (1992)
 * @param n Sample size
 */
export function crouxCorrectionFactorQn(n: number) {
  assert.gte(n, 2);

  const gaussianConsistency = 2.2219;
  const cn =
    n < 10
      ? [0.399, 0.994, 0.512, 0.844, 0.611, 0.857, 0.669, 0.872][n - 2]
      : n % 2 !== 0
      ? n / (n + 1.4)
      : n / (n + 3.8);

  return cn * gaussianConsistency;
}

/**
 * Nonparametric measure of spread
 * See: Alternatives to the Median Absolute Deviation - Rousseeuw and Croux (1993)
 */
export function crouxQn(
  sample: Indexable<number>,
  start = 0,
  len = sample.length - start,
): RobustScale {
  assert.bounds(sample, start + len - 1);
  if (len === 1) return oneObservation(sample);

  const N = len;
  const M = Math.floor((N * (N - 1)) / 2);
  const vTemp = new Float64Array(M);

  let m = 0;
  for (let i = start, end = i + N; i < end; i++) {
    for (let j = i + 1; j < end; j++) {
      vTemp[m++] = Math.abs(sample[i] - sample[j]);
    }
  }

  assert.eq(m, M);

  const h = Math.floor(N / 2 + 1); // roughly half
  const k = Math.floor((h * (h - 1)) / 2); // k = hC2

  const qnx25 = quickselect(vTemp, k - 1);

  return {
    spread: vTemp[qnx25],
    correctedSpread: vTemp[qnx25] * crouxCorrectionFactorQn(N),
  };
}

/**
 * Time-efficient algorithms for two highly robust estimators of scale
 * C. Croux and P. J. Rousseeuw (1992)
 * @param n Sample size
 */
export function crouxCorrectionFactorSn(n: number) {
  assert.gte(n, 2);

  const gaussianConsistency = 1.1926;
  const cn =
    n < 10
      ? [0.743, 1.851, 0.954, 1.351, 0.993, 1.198, 1.005, 1.131][n - 2]
      : n % 2 !== 0
      ? n / (n - 1)
      : 1;

  return cn * gaussianConsistency;
}

/**
 * Nonparametric measure of spread
 * See: Alternatives to the Median Absolute Deviation - Rousseeuw and Croux (1993)
 */
export function crouxSn(
  sample: Indexable<number>,
  start = 0,
  len = sample.length - start,
): RobustScale {
  assert.bounds(sample, start + len - 1);
  if (len === 1) return oneObservation(sample);

  const N = len;
  // the median of absolute differences around i-th sample value
  const medi = new Float64Array(N);
  // the median of medians of absolute differences around i-th sample value
  const medMed = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const si = sample[start + i];

    for (let j = 0; j < N; j++) {
      medi[j] = Math.abs(si - sample[start + j]);
    }

    // high-median
    // note: account for i == j - This distance should be 0.
    const kdx = quickselect(medi, Math.floor((N + 1) / 2));
    medMed[i] = medi[kdx];
  }

  // low-median
  const sdx = quickselect(medMed, Math.floor(N / 2));

  return {
    spread: medMed[sdx],
    correctedSpread: crouxCorrectionFactorSn(N) * medMed[sdx],
  };
}
