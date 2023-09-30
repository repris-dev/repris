import { Indexable } from '../array.js';
import * as rand from '../random.js';
import * as os from './OnlineStats.js';
import * as boot from './bootstrap.js';
import * as online from './OnlineStats.js';
import * as centralTendency from './centralTendency.js';
import { quantile } from './util.js';
import { hsm } from './mode.js';




describe('resampler', () => {
  test('Estimate std deviation', () => {
    const rng = rand.PRNGi32(31);
    const dist = rand.gaussian(2, 10, rng);
    const N = 100;

    const xs = new Float32Array(N);
    for (let i = 0; i < N; i++) xs[i] = dist();

    const resampler = boot.resampler(xs, rng);
    const sample = new os.Gaussian();
    const K = 10_000;

    for (let k = 0; k < K; k++) {
      const mean = new os.Gaussian();
      const resample = resampler();

      for (let i = 0; i < resample.length; i++) {
        mean.push(resample[i]);
      }

      sample.push(mean.mean());
    }

    const std = Math.sqrt(N) * sample.std();
    expect(std).toBeInRange(9, 11);
  });
});


describe('studentizedResampler', () => {
  /**
   * Dataset used in the book All of Nonparametric Statistics by L. Wasserman.
   * https://www.stat.cmu.edu/~larry/all-of-nonpar/data.html
   */
  const nerveData = [
    0.21, 0.03, 0.05, 0.11, 0.59, 0.06,
    0.18, 0.55, 0.37, 0.09, 0.14, 0.19,
    0.02, 0.14, 0.09, 0.05, 0.15, 0.23,
    0.15, 0.08, 0.24, 0.16, 0.06, 0.11,
    0.15, 0.09, 0.03, 0.21, 0.02, 0.14,
    0.24, 0.29, 0.16, 0.07, 0.07, 0.04,
    0.02, 0.15, 0.12, 0.26, 0.15, 0.33,
    0.06, 0.51, 0.11, 0.28, 0.36, 0.14,
    0.55, 0.28, 0.04, 0.01, 0.94, 0.73,
    0.05, 0.07, 0.11, 0.38, 0.21, 0.49,
    0.38, 0.38, 0.01, 0.06, 0.13, 0.06,
    0.01, 0.16, 0.05, 0.10, 0.16, 0.06,
    0.06, 0.06, 0.06, 0.11, 0.44, 0.05,
    0.09, 0.04, 0.27, 0.50, 0.25, 0.25,
    0.08, 0.01, 0.70, 0.04, 0.08, 0.16,
    0.38, 0.08, 0.32, 0.39, 0.58, 0.56,
    0.74, 0.15, 0.07, 0.26, 0.25, 0.01,
    0.17, 0.64, 0.61, 0.15, 0.26, 0.03,
    0.05, 0.34, 0.07, 0.10, 0.09, 0.02,
    0.30, 0.07, 0.12, 0.01, 0.16, 0.14,
    0.49, 0.07, 0.11, 0.35, 1.21, 0.17,
    0.01, 0.35, 0.45, 0.07, 0.93, 0.04,
    0.96, 0.14, 1.38, 0.15, 0.01, 0.05,
    0.23, 0.31, 0.05, 0.05, 0.29, 0.01,
    0.74, 0.30, 0.09, 0.02, 0.19, 0.47,
    0.01, 0.51, 0.12, 0.12, 0.43, 0.32,
    0.09, 0.20, 0.03, 0.05, 0.13, 0.15,
    0.05, 0.08, 0.04, 0.09, 0.10, 0.10,
    0.26, 0.07, 0.68, 0.15, 0.01, 0.27,
    0.05, 0.03, 0.40, 0.04, 0.21, 0.29,
    0.24, 0.08, 0.23, 0.10, 0.19, 0.20,
    0.26, 0.06, 0.40, 0.51, 0.15, 1.10,
    0.16, 0.78, 0.04, 0.27, 0.35, 0.71,
    0.15, 0.29, 0.04, 0.01, 0.28, 0.21,
    0.09, 0.17, 0.09, 0.17, 0.15, 0.62,
    0.50, 0.07, 0.39, 0.28, 0.20, 0.34,
    0.16, 0.65, 0.04, 0.67, 0.10, 0.51,
    0.26, 0.07, 0.71, 0.11, 0.47, 0.02,
    0.38, 0.04, 0.43, 0.11, 0.23, 0.14,
    0.08, 1.12, 0.50, 0.25, 0.18, 0.12,
    0.02, 0.15, 0.12, 0.08, 0.38, 0.22,
    0.16, 0.04, 0.58, 0.05, 0.07, 0.28,
    0.27, 0.24, 0.07, 0.02, 0.27, 0.27,
    0.16, 0.05, 0.34, 0.10, 0.02, 0.04,
    0.10, 0.22, 0.24, 0.04, 0.28, 0.10,
    0.23, 0.03, 0.34, 0.21, 0.41, 0.15,
    0.05, 0.17, 0.53, 0.30, 0.15, 0.19,
    0.07, 0.83, 0.04, 0.04, 0.14, 0.34,
    0.10, 0.15, 0.05, 0.04, 0.05, 0.65,
    0.16, 0.32, 0.87, 0.07, 0.17, 0.10,
    0.03, 0.17, 0.38, 0.28, 0.14, 0.07,
    0.14, 0.03, 0.21, 0.40, 0.04, 0.11,
    0.44, 0.90, 0.10, 0.49, 0.09, 0.01,
    0.08, 0.06, 0.08, 0.01, 0.15, 0.50,
    0.36, 0.08, 0.34, 0.02, 0.21, 0.32,
    0.22, 0.51, 0.12, 0.16, 0.52, 0.21,
    0.05, 0.46, 0.44, 0.04, 0.05, 0.04,
    0.14, 0.08, 0.21, 0.02, 0.63, 0.35,
    0.01, 0.38, 0.43, 0.03, 0.39, 0.04,
    0.17, 0.23, 0.78, 0.14, 0.08, 0.11,
    0.07, 0.45, 0.46, 0.20, 0.19, 0.50,
    0.09, 0.22, 0.29, 0.01, 0.19, 0.06,
    0.39, 0.08, 0.03, 0.28, 0.09, 0.17,
    0.45, 0.40, 0.07, 0.30, 0.16, 0.24,
    0.81, 1.35, 0.01, 0.02, 0.03, 0.06,
    0.12, 0.31, 0.64, 0.08, 0.15, 0.06,
    0.06, 0.15, 0.68, 0.30, 0.02, 0.04,
    0.02, 0.81, 0.09, 0.19, 0.14, 0.12,
    0.36, 0.02, 0.11, 0.04, 0.08, 0.17,
    0.04, 0.05, 0.14, 0.07, 0.39, 0.13,
    0.56, 0.12, 0.31, 0.05, 0.10, 0.13,
    0.05, 0.01, 0.09, 0.03, 0.27, 0.17,
    0.03, 0.05, 0.26, 0.23, 0.20, 0.76,
    0.05, 0.02, 0.01, 0.20, 0.21, 0.02,
    0.04, 0.16, 0.32, 0.43, 0.20, 0.13,
    0.10, 0.20, 0.08, 0.81, 0.11, 0.09,
    0.26, 0.15, 0.36, 0.18, 0.10, 0.34,
    0.56, 0.09, 0.15, 0.14, 0.15, 0.22,
    0.33, 0.04, 0.07, 0.09, 0.18, 0.08,
    0.07, 0.07, 0.68, 0.27, 0.21, 0.11,
    0.07, 0.44, 0.13, 0.04, 0.39, 0.14,
    0.10, 0.08, 0.02, 0.57, 0.35, 0.17,
    0.21, 0.14, 0.77, 0.06, 0.34, 0.15,
    0.29, 0.08, 0.72, 0.31, 0.20, 0.10,
    0.01, 0.24, 0.07, 0.22, 0.49, 0.03,
    0.18, 0.47, 0.37, 0.17, 0.42, 0.02,
    0.22, 0.12, 0.01, 0.34, 0.41, 0.27,
    0.07, 0.30, 0.09, 0.27, 0.28, 0.15,
    0.26, 0.01, 0.06, 0.35, 0.03, 0.26,
    0.05, 0.18, 0.46, 0.12, 0.23, 0.32,
    0.08, 0.26, 0.82, 0.10, 0.69, 0.15,
    0.01, 0.39, 0.04, 0.13, 0.34, 0.13,
    0.13, 0.30, 0.29, 0.23, 0.01, 0.38,
    0.04, 0.08, 0.15, 0.10, 0.62, 0.83,
    0.11, 0.71, 0.08, 0.61, 0.18, 0.05,
    0.20, 0.12, 0.10, 0.03, 0.11, 0.20,
    0.16, 0.10, 0.03, 0.23, 0.12, 0.01,
    0.12, 0.17, 0.14, 0.10, 0.02, 0.13,
    0.06, 0.21, 0.50, 0.04, 0.42, 0.29,
    0.08, 0.01, 0.30, 0.45, 0.06, 0.25,
    0.02, 0.06, 0.02, 0.17, 0.10, 0.28,
    0.21, 0.28, 0.30, 0.02, 0.02, 0.28,
    0.09, 0.71, 0.06, 0.12, 0.29, 0.05,
    0.27, 0.25, 0.10, 0.16, 0.08, 0.52,
    0.44, 0.19, 0.72, 0.12, 0.30, 0.14,
    0.45, 0.42, 0.09, 0.07, 0.62, 0.51,
    0.50, 0.47, 0.28, 0.04, 0.66, 0.08,
    0.11, 0.03, 0.32, 0.16, 0.11, 0.26,
    0.05, 0.07, 0.04, 0.22, 0.08, 0.08,
    0.01, 0.06, 0.05, 0.05, 0.16, 0.05,
    0.13, 0.42, 0.21, 0.36, 0.05, 0.01,
    0.44, 0.14, 0.14, 0.14, 0.08, 0.51,
    0.18, 0.02, 0.51, 0.06, 0.22, 0.01,
    0.09, 0.22, 0.59, 0.03, 0.71, 0.14,
    0.02, 0.51, 0.03, 0.41, 0.17, 0.37,
    0.39, 0.82, 0.81, 0.24, 0.52, 0.40,
    0.24, 0.06, 0.73, 0.27, 0.18, 0.01,
    0.17, 0.02, 0.11, 0.26, 0.13, 0.68,
    0.13, 0.08, 0.71, 0.04, 0.11, 0.13,
    0.17, 0.34, 0.23, 0.08, 0.26, 0.03,
    0.21, 0.45, 0.40, 0.03, 0.16, 0.06,
    0.29, 0.43, 0.03, 0.10, 0.10, 0.31,
    0.27, 0.27, 0.33, 0.14, 0.09, 0.27,
    0.14, 0.09, 0.08, 0.06, 0.16, 0.02,
    0.07, 0.19, 0.11, 0.10, 0.17, 0.24,
    0.01, 0.13, 0.21, 0.03, 0.39, 0.01,
    0.27, 0.19, 0.02, 0.21, 0.04, 0.10,
    0.06, 0.48, 0.12, 0.15, 0.12, 0.52,
    0.48, 0.29, 0.57, 0.22, 0.01, 0.44,
    0.05, 0.49, 0.10, 0.19, 0.44, 0.02,
    0.72, 0.09, 0.04, 0.02, 0.02, 0.06,
    0.22, 0.53, 0.18, 0.10, 0.10, 0.03,
    0.08, 0.15, 0.05, 0.13, 0.02, 0.10,
    0.51
  ];

  /** https://stats.stackexchange.com/questions/252780/which-bootstrap-method-is-most-preferred */
  test('Confidence intervals of a right-skewed sample', () => {
    const estimator = (xs: Indexable<number>) => {
      const g = new online.Gaussian();
      for (let i = 0; i < xs.length; i++) g.push(xs[i]);
      return g.skewness();
    };

    const resampler = boot.studentizedResampler(
      nerveData, estimator, 25, rand.PRNGi32(53)
    );

    const nResamples = 1000;
    const alpha = 0.05;

    const pivotalQuantities = new Float64Array(nResamples);
    const estStat = new online.Gaussian();
    const est0 = estimator(nerveData);

    for (let i = 0; i < nResamples; i++) {
      const ti = resampler();

      pivotalQuantities[i] = ti.pivotalQuantity;
      estStat.push(ti.estimate);
    }
    
    // standard deviation of the bootstrapped samples
    const bootStd = estStat.std();
    
    // interval
    const lo = est0 - bootStd * quantile(pivotalQuantities, 1 - alpha / 2);
    const hi = est0 - bootStd * quantile(pivotalQuantities, alpha / 2);

    // Note these ranges aren't those from the reference implementation; increase
    // the number of resamples to get more accurate (wider) intervals
    expect(est0).toBeCloseTo(1.76, 2);
    expect(lo).toBeInRange(1.45, 1.47);
    expect(hi).toBeInRange(2.24, 2.30);
  });

  /** Right skew, mode: ~186,000 */
  const sample0 = [
    182245172, 190774617, 188587804, 190909640, 191502488, 194640360, 193863240, 206718398,
    185000152, 186908581, 199763479, 192265037, 189065354, 188542573, 215178035, 200624225,
    196289184, 193586806, 186551251, 183458824, 185444970, 186568234, 187405508, 185726931,
    188997520, 185038472, 200132265, 184840612, 189935686, 185738183, 187750038, 185718324,
    189465778, 186467660, 188251129, 184117306, 188272470, 189312268, 186880828, 187809846,
    178245172,
  ];

  function stretchSample(sample: Indexable<number>, centre: number, stretch: number) {
    const newSample = new Float64Array(sample.length);
  
    for (let i = 0; i < sample.length; i++) {
      const dist = centre - sample[i];
      newSample[i] = dist > 0 ? centre - dist ** stretch : centre + (-dist) ** stretch;
    }
  
    return newSample;
  }

  test('Confidence intervals of a difference test', () => {
    const hsm0 = hsm(sample0).mode;
    const sample1 = stretchSample(sample0, hsm0, 1.15);
    const hsm1 = hsm(sample1).mode;
    
    const rng = rand.PRNGi32(959);
    const est = hsm0 - hsm1;

    // sample1 is just sample0 stretched around its HSM so they should both
    // have the same point estimate.
    expect(est).toBe(0);

    const resampler = boot.pairedStudentizedResampler(
      sample0,
      sample1,
      (x0, x1) => hsm(x0).mode - hsm(x1).mode,
      100,
      rng
    );

    const nResamples = 500;
    const alpha = 0.01;
    const pivotalQuantities = new Float64Array(nResamples);
    const estStat = new online.Gaussian();

    for (let i = 0; i < nResamples; i++) {
      const ti = resampler();
      pivotalQuantities[i] = ti.pivotalQuantity;
      estStat.push(ti.estimate);
    }

    const bootStd = estStat.std();
    const lo = est - bootStd * quantile(pivotalQuantities, 1 - alpha / 2);
    const hi = est - bootStd * quantile(pivotalQuantities, alpha / 2);

    // Note the non-symmetry of the confidence interval. Since the original (non-stretched) sample
    // is heavily right-skewed, the confidence interval here is very sensitive to the lowest value of
    // of the sample.
    expect(lo / hsm0).toBeInRange(-0.5, 0);
    expect(hi / hsm0).toBeInRange(0, 0.25);
  });

  /**
   * @see: https://www.samlau.me/test-textbook/ch/18/hyp_studentized.html
   * Skipped because this test takes ~30 seconds to run, but is kept here
   * for research purposes.
   */
  test.skip('coverage of a log-normal distribution', () => {
    const N = 10;
    const nResamples = 500;
    const mean = 1;
    const stdDev = 2;
    const alpha = 0.01;
    const coverageRuns = 100;

    const rng = rand.PRNGi32(55);
    const dist = rand.gaussian(mean, stdDev, rng);

    // mean of a log-normal dist.
    const logMean = Math.exp(mean + stdDev ** 2 / 2);
    const isCovered = (lo: number, hi: number) => lo < logMean && hi > logMean;

    const coverage = {
      studentized: 0,
      percentile: 0,
    };

    for (let n = 0; n < coverageRuns; n++) {
      const xs = new Float32Array(N);
      for (let i = 0; i < N; i++) xs[i] = Math.exp(dist());

      const mu = centralTendency.mean(xs);
      const resampler = boot.studentizedResampler(xs, centralTendency.mean, 75, rng);

      const pivotalQuantities = new Float64Array(nResamples);
      const estimates = new Float64Array(nResamples);

      for (let i = 0; i < nResamples; i++) {
        const ti = resampler();
        pivotalQuantities[i] = ti.pivotalQuantity;
        estimates[i] = ti.estimate;
      }

      {
        // studentized
        const os = online.Gaussian.fromValues(pivotalQuantities);
        const se = os.std();

        const lo = mu - se * quantile(pivotalQuantities, 1 - alpha / 2);
        const hi = mu - se * quantile(pivotalQuantities, alpha / 2);

        if (isCovered(lo, hi)) coverage.studentized++;
      }

      {
        // percentile
        const lo = quantile(estimates, alpha / 2);
        const hi = quantile(estimates, 1 - alpha / 2);

        if (isCovered(lo, hi)) coverage.percentile++;
      }
    }

    // studentized has better coverage
    expect(coverage.percentile).toBeLessThan(coverage.studentized);
  });
});
