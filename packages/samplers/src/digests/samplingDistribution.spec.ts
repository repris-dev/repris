import {
  timer,
  random,
  iterator,
  quantity as q,
  typeid,
  Status,
  asTuple,
  stats,
} from '@repris/base';

import { annotate } from '../annotators.js';
import * as duration from '../samples/duration.js';
import * as defaults from '../defaults.js';
import { Digest, processSamples, createOutlierSelection } from './samplingDistribution.js';
import { DigestedSampleStatus } from './types.js';

const gen = random.PRNGi32(52);

function create(mean: number, std: number, size: number) {
  const rng = random.gaussian(mean, std, gen);
  const s = new duration.Duration(defaults.samples.duration, gen);

  for (const x of iterator.take(size, iterator.gen(rng))) {
    s.push(timer.HrTime.from(q.create('nanosecond', x)));
  }

  return s;
}

function postProcess(mwu: Digest) {
  const order = [] as duration.Duration[];
  const a: Record<DigestedSampleStatus, duration.Duration[]> = {
    consistent: [],
    rejected: [],
    outlier: [],
  };

  for (let { sample, status } of mwu.stat()) {
    order.push(sample);
    a[status].push(sample);
  }

  return { order, ...a };
}

describe('processSamples()', () => {
  const sA = create(300, 5, 250);
  const sB = create(300, 10, 250);
  const sC = create(300, 20, 250);
  const sD = create(6000, 10, 250);
  const sE = create(6000, 10, 250);
  const sF = create(6500, 10, 250);

  const annotation = new Map([['duration:mean' as typeid, {}]]);

  test('analysis() - cluster of 3, 1 outlier', () => {
    const samples = [
      sB,
      sB,
      sB,
      sA,
      sA,
      sA,
      sD, // <-- outlier
      sC,
      sC,
    ];

    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    const digest = processSamples(annotated, {
      locationEstimationType: 'duration:mean' as typeid,
      requiredEffectSize: 0.1,
      powerLevel: 0.9,
      sensitivity: 0.99,
      minSize: 2,
      maxSize: 8,
    });

    const result = postProcess(Status.get(digest));

    // samples a, b, c
    expect(result.consistent.length).toBe(8);
    expect(result.consistent.includes(sD)).toBeFalsy();

    // The outlier is also the slowest
    expect(result.order.length).toEqual(9);
    expect(result.order[result.order.length - 1]).toBe(sD);
  });

  test('minEffect', () => {
    const samples = [sA, sF];
    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    {
      // High threshold of uncertainty
      const a = postProcess(
        Status.get(
          processSamples(annotated, {
            locationEstimationType: 'duration:mean' as typeid,
            requiredEffectSize: Infinity,
            powerLevel: 0.9,
            sensitivity: 0.99,
            minSize: 2,
            maxSize: 10,
          }),
        ),
      );

      expect(a.consistent).toHaveValues([sA, sF]);
      expect(a.outlier.length).toBe(0);
      expect(a.rejected.length).toBe(0);
    }
    {
      // Low threshold of uncertainty
      const a = postProcess(
        Status.get(
          processSamples(annotated, {
            locationEstimationType: 'duration:mean' as typeid,
            requiredEffectSize: 0.01,
            powerLevel: 0.9,
            sensitivity: 0.99,
            minSize: 2,
            maxSize: 10,
          }),
        ),
      );

      expect(a.consistent).toEqual([]);
      expect(a.outlier.length).toBe(2);
      expect(a.rejected.length).toBe(0);
    }
  });

  test('maxSize', () => {
    const samples = [sF, sB, sC, sE, sA];
    const entropy = random.PRNGi32(521);

    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    const a = postProcess(
      Status.get(
        processSamples(
          annotated,
          {
            locationEstimationType: 'duration:mean' as typeid,
            requiredEffectSize: 10,
            powerLevel: 0.9,
            sensitivity: 0.99,
            minSize: 2,
            maxSize: 3,
          },
          entropy,
        ),
      ),
    );

    expect(a.order).toHaveValues([sA, sB, sC, sE, sF]);

    expect(a.rejected).toHaveValues([sE, sF]);
    expect(a.consistent).toHaveValues([sA, sB, sC]);
    expect(a.outlier).toEqual([]);
  });

  test('maxSize, outliers', () => {
    const samples = [sB, sC, sD, sE, sA];
    const entropy = random.PRNGi32(521);

    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    const a = postProcess(
      Status.get(
        processSamples(
          annotated,
          {
            locationEstimationType: 'duration:mean' as typeid,
            requiredEffectSize: 0.002,
            powerLevel: 0.9,
            sensitivity: 0.99,
            minSize: 2,
            maxSize: 3,
          },
          entropy,
        ),
      ),
    );

    expect(a.order).toHaveValues([sA, sB, sC, sE, sD]);
    expect(a.rejected).toHaveValues([sD, sE]);
    expect(a.consistent).toEqual([]);
    expect(a.outlier).toHaveValues([sA, sB, sC]);
  });
});

describe('outlierSelection', () => {
  test('Rejects all values once', () => {
    const xs = [5.5, 5.4, 5.3, 3.4, 3, 2.2, 2.1, 2, 1.2, 1, 1.1, 1.3, 0.2, 0.1, 0];
    const fn = createOutlierSelection<number>(xs, x => x);
    const seen = new Set<number>();

    for (let i = 0; i < xs.length; i++) {
      const x = fn();
      expect(typeof x === 'number').toEqual(true);
      expect(seen.has(x!)).toEqual(false);

      seen.add(x!);
    }

    expect(fn()).toEqual(undefined);
  });

  test('Rejects equal values', () => {
    const xs = [5, 5, 5, 5, 5, 5, 5];
    const fn = createOutlierSelection<number>(xs, x => x);

    for (let i = 0; i < xs.length; i++) {
      const x = fn();
      expect(x).toEqual(5);
    }

    expect(fn()).toEqual(undefined);
  });

  test('Rejects outliers', () => {
    const std0 = 5;
    const entropy = random.PRNGi32(371);
    const rng = random.gaussian(0, std0, entropy);
    const noise = random.gaussian(0, 50, entropy);
    const xs = [] as number[];

    const N = 500;
    const noiseRatio = 0.3;

    // normal dist.
    for (const x of iterator.gen(rng, N * (1 - noiseRatio))) xs.push(x);
    // outliers
    for (const x of iterator.gen(noise, N * noiseRatio)) xs.push(x);

    const filter = createOutlierSelection<number>(
      iterator.collect(xs.keys()),
      idx => xs[idx],
      entropy,
    );

    const outlierMask = new Int32Array(xs.length);

    // stats excluding outliers
    const getStats = () =>
      stats.online.Gaussian.fromValues(xs.filter((_, idx) => outlierMask[idx] < 1));

    // In 10% increments, remove 'outliers', then measure the
    // mean/stddev of the unfiltered items. The
    const stats0 = getStats();

    for (let i = 0; i < N * 0.75; ) {
      // filter noise in 5% increments
      for (let j = 0; j < N * 0.05; j++, i++) {
        const idx = filter()!;
        outlierMask[idx] = 1;
      }

      const statsN = getStats();

      // the stddev shouldn't fall (much) below the normal-dist
      expect(statsN.std()).toBeGreaterThan(std0 * 0.9);
      // the stddev should always be < the entire sample
      expect(statsN.std()).toBeLessThan(stats0.std());

      if (i > 2 * N * noiseRatio) {
        // Outliers should be removed by this point.

        // mean should be within half a stddev of the underlying
        expect(Math.abs(statsN.mean() - stats0.mean())).toBeLessThan(std0 * 0.5);
        // stddev should be within 50% of underlying stddev
        expect(Math.abs(statsN.std() - std0)).toBeLessThan(std0 * 0.5);
        // little skew
        expect(Math.abs(statsN.skewness())).toBeLessThan(0.5);
        // low kurtosis
        expect(Math.abs(statsN.kurtosis())).toBeLessThan(1.5);
      }
    }
  });

  test('Bimodal distribution', () => {
    const entropy = random.PRNGi32(15);
    const rng0 = random.gaussian(10, 0.5, entropy);
    const rng1 = random.gaussian(20, 0.5, entropy);
    const xs = [] as number[];

    const N = 15;

    // N normal dist., small stddev.
    for (const x of iterator.take(N, iterator.gen(rng0))) xs.push(x);
    // N-1, outliers, well separated.
    for (const x of iterator.take(N - 1, iterator.gen(rng1))) xs.push(x);

    const filter = createOutlierSelection<number>(
      iterator.collect(xs.keys()),
      idx => xs[idx],
      entropy,
    );

    const outlierMask = new Int32Array(xs.length);

    // stats excluding outliers
    const getStats = () =>
      stats.online.Gaussian.fromValues(xs.filter((_, idx) => outlierMask[idx] < 1));

    const stats0 = getStats();
    expect(stats0.mean()).toBeInRange(13, 17);
    expect(stats0.std()).toBeInRange(3, 6);

    for (let i = 0; i < N; i++) outlierMask[filter()!] = 1;

    // With an (almost) bimodal distribution, the outlier selection doesn't fixate
    // on the (marginally) higher/larger peak - we reject from each sample equally.
    const statsN = getStats();
    expect(statsN.mean()).toBeInRange(13, 17);
    expect(statsN.std()).toBeInRange(3, 6);
  });

  test('Recursive rejection', () => {
    const entropy = random.PRNGi32(25);
    const rng0 = random.gaussian(10, 0.5, entropy);
    const rng1 = random.gaussian(25, 2, entropy);

    let key = 0;

    const xs = new Map<number, number>();
    const N = 50;

    // N normal dist., small stddev.
    for (const x of iterator.gen(rng0, N)) xs.set(key++, x);
    // outliers, well separated.
    for (const x of iterator.gen(rng1, N / 2)) xs.set(key++, x);

    for (let i = 0; i < 50; i++) {
      xs.set(key++, rng0());
      xs.set(key++, rng1());

      const filter = createOutlierSelection<number>(
        iterator.collect(xs.keys()),
        key => xs.get(key)!,
        entropy,
      );

      // reject two observations, which should be from the outliers
      xs.delete(filter()!);
      xs.delete(filter()!);
    }

    const os = stats.online.Gaussian.fromValues(xs.values());

    expect(os.mean()).toBeInRange(9.5, 10.5);
    expect(os.std(1)).toBeInRange(0.25, 0.75);
    expect(os.skewness(1)).toBeInRange(-0.5, 0.5);
  });
});
