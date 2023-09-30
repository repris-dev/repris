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

function stretchSample(sample: Indexable<number>, centre: number, stretch: number) {
  const newSample = new Float64Array(sample.length);

  for (let i = 0; i < sample.length; i++) {
    const dist = centre - sample[i];
    newSample[i] = dist > 0 ? centre - dist ** stretch : centre + (-dist) ** stretch;
  }

  return newSample;
}

describe('studentizedResampler', () => {
  const sample0 = [
    182245172, 190774617, 188587804, 190909640, 191502488, 194640360, 193863240, 206718398,
    185000152, 186908581, 199763479, 192265037, 189065354, 188542573, 215178035, 200624225,
    196289184, 193586806, 186551251, 183458824, 185444970, 186568234, 187405508, 185726931,
    188997520, 185038472, 200132265, 184840612, 189935686, 185738183, 187750038, 185718324,
    189465778, 186467660, 188251129, 184117306, 188272470, 189312268, 186880828, 187809846,
    178245172,
  ];

  const hsm0 = hsm(sample0).mode;
  const sample1 = stretchSample(sample0, hsm0, 1.15);
  const hsm1 = hsm(sample1).mode;

  test('Confidence intervals of a right-skewed sample', () => {
    const rng = rand.PRNGi32(53);
    const resampler = boot.studentizedResampler(sample0, xs => hsm(xs).mode, 50, rng);

    const nResamples = 500;
    const alpha = 0.05;
    const pivotalQuantities = new Float64Array(nResamples);
    const estStat = new online.Gaussian();

    for (let i = 0; i < nResamples; i++) {
      const ti = resampler();
      pivotalQuantities[i] = ti.pivotalQuantity;
      estStat.push(ti.estimate);
    }

    // studentized bootstrap, less biased
    const bootStd = estStat.std();
    const lo = hsm0 - bootStd * quantile(pivotalQuantities, 1 - alpha / 2);
    const hi = hsm0 - bootStd * quantile(pivotalQuantities, alpha / 2);

    expect(hsm0).toBeInRange(180e6, 189e6);
    expect(hi - lo).toBeInRange(3e6, 7e6);
    expect(lo).toBeLessThan(hsm0);
    expect(hi).toBeGreaterThan(hsm0);

    // Check symmetry of confidence intervals
    expect((lo + hi) / hsm0).toBeInRange(1.8, 2.2);
  });

  test('Confidence intervals of a difference test', () => {
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
