import { timer, random, iterator, quantity as q, typeid, Status, asTuple } from '@repris/base';
import * as duration from '../samples/duration.js';
import * as defaults from '../defaults.js';
import { Digest, process, createOutlierSelection } from './samplingDistribution.js';
import { DigestedSampleStatus } from './types.js';
import { annotate } from '../annotators.js';

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

describe('process()', () => {
  const sA = create(300, 5, 250);
  const sB = create(300, 10, 250);
  const sC = create(300, 50, 250);
  const sD = create(1000, 2, 250);
  const sE = create(1000, 10, 250);
  const sF = create(1005, 10, 250);

  const annotation = new Map([['duration:mean' as typeid, {}]]);

  test('analysis() - cluster of 3, 1 outlier', () => {
    const samples = [
      sB,
      sA,
      sD, // <-- outlier
      sC,
    ];

    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    const digest = process(annotated, {
      locationEstimationType: 'duration:mean' as typeid,
      maxUncertainty: 0.1,
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

  test('maxUncertainty', () => {
    const samples = [sA, sF];
    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    {
      // High threshold of uncertainty
      const a = postProcess(
        Status.get(
          process(annotated, {
            locationEstimationType: 'duration:mean' as typeid,
            maxUncertainty: Infinity,
            minSize: 2,
            maxSize: 10,
          })
        )
      );

      expect(a.consistent).toEqual([sA, sF]);
      expect(a.outlier.length).toBe(0);
      expect(a.rejected.length).toBe(0);
    }
    {
      // Low threshold of uncertainty
      const a = postProcess(
        Status.get(
          process(annotated, {
            locationEstimationType: 'duration:mean' as typeid,
            maxUncertainty: 0.1,
            minSize: 2,
            maxSize: 10,
          })
        )
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
        process(
          annotated,
          {
            locationEstimationType: 'duration:mean' as typeid,
            maxUncertainty: 0.9,
            minSize: 2,
            maxSize: 4,
          },
          entropy
        )
      )
    );

    expect(a.order).toHaveValues([sA, sB, sC, sE, sD, sF]);
    expect(a.rejected).toEqual([sE, sF]);
    expect(a.consistent).toHaveValues([sA, sB, sC, sD]);
    expect(a.outlier).toEqual([]);
  });

  test('maxSize, outliers', () => {
    const samples = [sF, sB, sC, sD, sE, sA];
    const entropy = random.PRNGi32(521);

    const annotated = samples.map(s => asTuple([s, Status.get(annotate(s, annotation)).toJson()]));

    const a = postProcess(
      Status.get(
        process(
          annotated,
          {
            locationEstimationType: 'duration:mean' as typeid,
            maxUncertainty: 0.2,
            minSize: 2,
            maxSize: 4,
          },
          entropy
        )
      )
    );

    expect(a.order).toHaveValues([sA, sB, sC, sE, sD, sF]);
    expect(a.rejected).toEqual([sE, sF]);
    expect(a.consistent).toEqual([]);
    expect(a.outlier).toHaveValues([sA, sB, sC, sD]);
  });
});

describe('outlierSelection', () => {
  const xs = [5.5, 5.4, 5.3, 3.4, 3, 2.2, 2.1, 2, 1.2, 1, 1.1, 1.3, 0.2, 0.1, 0];

  test('Rejects values once', () => {
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
});
