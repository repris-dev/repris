import { Indexable, copyTo } from '../array.js';
import * as random from '../random.js';
import { online } from '../stats.js';

/**
 * @returns A function which generates resamples of the given sample
 * with observations in the order they appear in the given sample.
 */
export function resampler(
  sample: Indexable<number>,
  entropy = random.PRNGi32(),
  smoothing = 0,
): () => Float64Array {
  const N = sample.length,
    rng = random.uniformi(0, N - 1, entropy),
    smoother = smoothing > 0 ? random.uniform(-smoothing, smoothing, entropy) : () => 0,
    counts = new Int32Array(N),
    replicate = new Float64Array(N);

  return () => {
    counts.fill(0);
    for (let i = 0; i < N; i++) counts[rng()]++;

    for (let n = 0, i = 0; n < N; n++) {
      const x = sample[n];
      let k = counts[n];

      while (k-- > 0) {
        replicate[i++] = x + smoother();
      }
    }

    return replicate;
  };
}

export type StudentizedResample = {
  /** Bootstrap for this iteration */
  replicate: Indexable<number>;
  /** Statistic for this iteration */
  estimate: number;
  /** */
  pivotalQuantity: number;
  /** Estimated standard error of the replicate */
  stdErr: number;
};

/**
 * @reference https://stats.stackexchange.com/questions/252780/which-bootstrap-method-is-most-preferred
 */
export function studentizedResampler(
  sample: Indexable<number>,
  estimator: (xs: Indexable<number>) => number,
  secondResampleSize = 50,
  entropy = random.PRNGi32()
): () => StudentizedResample {
  const N = sample.length,
    resample = resampler(sample, entropy),
    innerBuff = new Float64Array(N),
    innerBoot = resampler(innerBuff, entropy),
    innerReplicateStat = new online.Gaussian(),
    est = estimator(sample);

  return () => {
    const replicate = resample();
    const esti = estimator(replicate);

    // Bootstrap the bootstrap sample to estimate its std. error.
    copyTo(replicate, innerBuff);
    innerReplicateStat.reset();

    for (let k = 0; k < secondResampleSize; k++) {
      innerReplicateStat.push(estimator(innerBoot()));
    }

    const stdErr = innerReplicateStat.std();
    const pivotalQuantity = (esti - est) / stdErr;

    return {
      replicate,
      estimate: esti,
      stdErr,
      pivotalQuantity,
    };
  };
}

export function pairedStudentizedResampler(
  sample0: Indexable<number>,
  sample1: Indexable<number>,
  estimator: (xs0: Indexable<number>, xs1: Indexable<number>) => number,
  innerResampleSize = 50,
  entropy = random.PRNGi32()
): () => StudentizedResample {
  const N0 = sample0.length;
  const N1 = sample1.length;

  const resample0 = resampler(sample0, entropy);
  const resample1 = resampler(sample1, entropy);

  const innerBuff0 = new Float64Array(N0);
  const innerBuff1 = new Float64Array(N1);

  const innerBoot0 = resampler(innerBuff0, entropy);
  const innerBoot1 = resampler(innerBuff1, entropy);

  const innerBootStat = new online.Gaussian();
  const est = estimator(sample0, sample1);

  return () => {
    const replicate0 = resample0();
    const replicate1 = resample1();

    innerBootStat.reset();

    // Bootstrap the bootstrap sample to estimate its std. error.
    copyTo(replicate0, innerBuff0);
    copyTo(replicate1, innerBuff1);

    for (let k = 0; k < innerResampleSize; k++) {
      innerBootStat.push(estimator(innerBoot0(), innerBoot1()));
    }

    const esti = estimator(replicate0, replicate1);
    const stdErr = innerBootStat.std();
    const pivotalQuantity = (esti - est) / stdErr;

    return {
      replicate: replicate0,
      estimate: esti,
      stdErr,
      pivotalQuantity,
    };
  };
}
