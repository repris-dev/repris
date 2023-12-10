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
import {
  Digest,
  processSamples,
  createOutlierSelection,
} from './samplingDistribution.js';
import { DigestedSampleStatus } from './types.js';

const gen = random.PRNGi32(52);

function create(mean: number, std: number, size: number) {
  const rng = random.gaussian(mean, std, gen);
  const s = new duration.Duration(defaults.samples.duration);

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
  const sC = create(300, 50, 250);
  const sD = create(1000, 2, 250);
  const sE = create(6000, 10, 250);
  const sF = create(6500, 10, 250);

  const annotation = new Map([['duration:mean' as typeid, {}]]);

  test('analysis() - cluster of 3, 1 outlier', () => {
    const samples = [
      sB,
      sA,
      sD, // <-- outlier
      sC,
    ];

    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    const digest = processSamples(annotated, {
      locationEstimationType: 'duration:mean' as typeid,
      requiredEffectSize: 0.1,
      powerLevel: 0.99,
      minSize: 2,
      maxSize: 3,
    });

    const result = postProcess(Status.get(digest));

    // samples a, b, c
    expect(result.consistent.length).toBe(3);
    expect(result.consistent.includes(sD)).toBeFalsy();

    // The outlier is also the slowest
    expect(result.order.length).toEqual(4);
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
            powerLevel: 0.99,
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
            powerLevel: 0.99,
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
    const samples = [sF, sB, sC, sD, sE, sA];
    const entropy = random.PRNGi32(521);

    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    const a = postProcess(
      Status.get(
        processSamples(
          annotated,
          {
            locationEstimationType: 'duration:mean' as typeid,
            requiredEffectSize: 10,
            powerLevel: 0.99,
            minSize: 2,
            maxSize: 4,
          },
          entropy,
        ),
      ),
    );

    expect(a.order).toHaveValues([sA, sB, sC, sE, sD, sF]);
    expect(a.rejected).toHaveValues([sE, sF]);
    expect(a.consistent).toHaveValues([sA, sB, sC, sD]);
    expect(a.outlier).toEqual([]);
  });

  test('maxSize, outliers', () => {
    const samples = [sF, sB, sC, sD, sE, sA];
    const entropy = random.PRNGi32(521);

    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    const a = postProcess(
      Status.get(
        processSamples(
          annotated,
          {
            locationEstimationType: 'duration:mean' as typeid,
            requiredEffectSize: 0.2,
            powerLevel: 0.99,
            minSize: 2,
            maxSize: 4,
          },
          entropy,
        ),
      ),
    );

    expect(a.order).toHaveValues([sA, sB, sC, sE, sD, sF]);
    expect(a.rejected).toHaveValues([sE, sF]);
    expect(a.consistent).toEqual([]);
    expect(a.outlier).toHaveValues([sA, sB, sC, sD]);
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
    const entropy = random.PRNGi32(15);
    const rng = random.gaussian(0, std0, entropy);
    const noise = random.gaussian(0, 50, entropy);
    const xs = [] as number[];

    const N = 500;
    const noiseRatio = 0.3;

    // normal dist.
    for (const x of iterator.take(N * (1 - noiseRatio), iterator.gen(rng))) xs.push(x);
    // outliers
    for (const x of iterator.take(N * noiseRatio, iterator.gen(noise))) xs.push(x);

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

    for (let i = 0; i < N * 0.75;) {
      // filter noise in 5% increments
      for (let j = 0; j < N * 0.05; j++, i++) {
        outlierMask[filter()!] = 1;
      }

      const statsN = getStats();

      // the stddev shouldn't fall (much) below the normal-dist
      expect(statsN.std()).toBeGreaterThan(std0 * 0.8);
      // the stddev should always be < the entire sample
      expect(statsN.std()).toBeLessThan(stats0.std());

      if (i > 2 * N * noiseRatio) {
        // Outliers should be removed by this point.

        // mean should be within half a stddev of the underlying
        expect(Math.abs(statsN.mean() - stats0.mean())).toBeLessThan(std0 * 0.5);
        // stddev should be within 20% of underlying stddev
        expect(Math.abs(statsN.std() - std0)).toBeLessThan(std0 * 0.2);
        // little skew
        expect(Math.abs(statsN.skewness())).toBeLessThan(0.5);
        // low kurtosis
        expect(Math.abs(statsN.kurtosis())).toBeLessThan(1);
      }
    }
  });
});
