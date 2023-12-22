import { ArrayView, copyTo } from '../array.js';
import { assert } from '../index.js';
import * as random from '../random.js';
import { normal, online, quantile } from '../stats.js';

/**
 * @returns A function which generates resamples of the given sample
 * with observations in the order they appear in the given sample.
 */
export function resampler(
  sample: ArrayView<number>,
  entropy = random.mathRand,
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
  replicate: ArrayView<number>;
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
  sample: ArrayView<number>,
  estimator: (xs: ArrayView<number>) => number,
  secondResampleSize = 50,
  entropy = random.mathRand,
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
  sample0: ArrayView<number>,
  sample1: ArrayView<number>,
  estimator: (xs0: ArrayView<number>, xs1: ArrayView<number>) => number,
  secondaryResamples: number,
  entropy = random.mathRand,
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

    for (let k = 0; k < secondaryResamples; k++) {
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

/**
 * A percentile bootstrapped paired HSM difference test of two samples.
 * x0 - x1
 */
export function differenceTest(
  /** First sample (x0) */
  x0: ArrayView<number>,
  /** Second sample (x1) */
  x1: ArrayView<number>,
  /** Function to estimate the difference between two resamples */
  estimator: (x0: ArrayView<number>) => number,
  /** The confidence level */
  level: number,
  /** The number of resamples */
  K: number,
  /** Source of randomness */
  entropy = random.mathRand,
  /** Smoothing factor as a standard deviation of a gaussian distribution */
  smoothing: number | [smoothing0: number, smoothing1: number] = 0,
): [lo: number, hi: number] {
  assert.inRange(level, 0, 1);
  assert.gt(1 - level, 1 / K, 'The number of resamples isn\'t high enough for the given confidence level')
  assert.gte(smoothing, 0);

  // bootstrap distribution of HSM differences
  const pointEsts = new Float64Array(K);
  const [smoothing0, smoothing1] =
    typeof smoothing === 'number' ? [smoothing, smoothing] : smoothing;

  for (let i = 0, next0 = resampler(x0, entropy, smoothing0); i < K; i++) {
    pointEsts[i] = estimator(next0());
  }

  for (let i = 0, next1 = resampler(x1, entropy, smoothing1); i < K; i++) {
    pointEsts[i] -= estimator(next1());
  }

  return [quantile(pointEsts, 0.5 - level / 2), quantile(pointEsts, 0.5 + level / 2)];
}

export type StudentizedDifferenceResult = {
  interval: [lo: number, hi: number],
  /**
   * Empirical power - The probability of rejecting the null hypothesis
   * if the alternative hypothesis (that there is a difference) is true.
   */
  power: number
};

/**
 * A studentized bootstrapped paired difference test of two samples. x0 - x1
 * @reference https://olebo.github.io/textbook/ch/18/hyp_studentized.html
 * @reference http://bebi103.caltech.edu.s3-website-us-east-1.amazonaws.com/2019a/content/recitations/bootstrapping.html
 */
export function studentizedDifferenceTest(
  /** First sample (x0) */
  x0: ArrayView<number>,
  /** Second sample (x1) */
  x1: ArrayView<number>,
  /** Function to estimate the difference between two resamples */
  estimator: (x0: ArrayView<number>, x1: ArrayView<number>) => number,
  /** The confidence level */
  confidence: number,
  /** Number of primary resamples */
  K: number,
  /** Number of secondary resamples */
  KK: number,
  /** Random source */
  entropy = random.mathRand,
  /** Add bias correction to the confidence interval */
  bc = false,
): StudentizedDifferenceResult {
  assert.inRange(confidence, 0, 1);
  assert.gt(1 - confidence, 1 / K, 'The number of resamples isn\'t high enough for the given confidence level')
  assert.gt(KK, 0);

  const alpha = 1 - confidence;
  const resampler = pairedStudentizedResampler(x0, x1, estimator, KK, entropy);

  const stat0 = estimator(x0, x1),
    pivotalQuantities = new Float64Array(K),
    estStat = new online.Gaussian();

  const pz = normal.ppf(1 - alpha / 2);
    
  // total evidence in favour of the alternate hypothesis
  let power = 0;
  let bias = 0;

  for (let i = 0; i < K; i++) {
    const ti = resampler();
    const lo = ti.estimate - ti.stdErr * pz;
    const hi = ti.estimate + ti.stdErr * pz;
    
    if (hi < 0 || lo > 0) power++;
    if (ti.estimate < stat0) bias++;

    pivotalQuantities[i] = ti.pivotalQuantity;
    estStat.push(ti.estimate);
  }

  power /= K;

  const p = bc
    ? biasCorrectedInterval(bias / K, alpha)
    : [alpha / 2, 1 - alpha / 2];

  const interval: [number, number] = [
    stat0 - estStat.std() * quantile(pivotalQuantities, p[1]),
    stat0 - estStat.std() * quantile(pivotalQuantities, p[0]),
  ];

  return {
    interval,
    power
  };
}

function biasCorrectedInterval(bias: number, alpha: number) {
  const z0 = normal.ppf(bias);
  const zlo = normal.ppf(alpha / 2);
  const zhi = normal.ppf(1 - alpha / 2);

  const plo = normal.cdf(z0 + zlo);
  const phi = normal.cdf(z0 + zhi);

  return [plo, phi];
}

/** Calculate the percentile confidence interval of a statistic for a given sample */
export function confidenceInterval(
  /** The sample */
  xs: ArrayView<number>,
  /** Function to estimate a statistic */
  estimator: (xi: ArrayView<number>) => number,
  /** Confidence level */
  level: number,
  /** Number of bootstrap resamples */
  K: number,
  /** Smoothing to apply to resamples, if any */
  smoothing?: number,
  entropy = random.mathRand,
  bc?: boolean
): [lo: number, hi: number] {
  assert.inRange(level, 0, 1);
  assert.gt(K, 1);
  
  // bootstrap sample distribution
  const dist = new Float64Array(K);
  const alpha = 1 - level;
  const est0 = estimator(xs);

  let bias = 0;

  for (let i = 0, next = resampler(xs, entropy, smoothing); i < K; i++) {
    dist[i] = estimator(next());
    if (dist[i] < est0) bias++;
  }

  const p = bc
    ? biasCorrectedInterval(bias / K, alpha)
    : [alpha / 2, 1 - alpha / 2];

  return [quantile(dist, p[0]), quantile(dist, p[1])];
}
