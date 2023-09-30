import { timer, random, iterator, quantity as q } from '@repris/base';
import * as duration from '../samples/duration.js';
import * as defaults from '../defaults.js';
import { Result, conflate } from './duration.js';
import { ConflatedSampleStatus } from './types.js';

const gen = random.PRNGi32(52);

function create(mean: number, std: number, size: number) {
  const rng3 = random.gaussian(mean, std, gen);
  const s = new duration.Duration(defaults.samples.duration);

  for (const x of iterator.take(size, iterator.gen(rng3))) {
    s.push(timer.HrTime.from(q.create('nanosecond', x)));
  }

  return s;
}

function postProcess(mwu: Result) {
  const order = [] as duration.Duration[];
  const a: Record<ConflatedSampleStatus, duration.Duration[]> = {
    consistent: [],
    rejected: [],
    outlier: [],
  }

  for (let { sample, status } of mwu.stat()) {
    order.push(sample);
    a[status].push(sample);
  }

  return { order, ...a, };
}

describe('Duration', () => {
  const sA = create(300, 5, 250);
  const sB = create(300, 10, 250);
  const sC = create(300, 50, 250);
  const sD = create(1000, 2, 250);
  const sE = create(1000, 10, 250);
  const sF = create(1005, 10, 250);

  describe('exclusionMethod: "slowest"', () => {
    test('analysis() - cluster of 3, 1 outlier', () => {
      const samples = [
        sB,
        sA,
        sD, // <-- outlier
        sC,
      ];

      const conflation = conflate(samples, { maxEffectSize: 0.1, minSize: 2, maxSize: 3, exclusionMethod: 'slowest' });
      const result = postProcess(conflation);

      // samples a, b, c
      expect(result.consistent.length).toBe(3);
      expect(result.consistent.includes(sD)).toBeFalsy();

      // The outlier is also the slowest
      expect(result.order.length).toEqual(4);
      expect(result.order[result.order.length - 1]).toBe(sD);
    });

    test('analysis() - 2 clusters of 2', () => {
      const conflation = conflate(
        [sF, sB, sA, sE],
        { maxEffectSize: 0.5, minSize: 2, maxSize: 5, exclusionMethod: 'slowest' }
      );

      const result = postProcess(conflation);
  
      // fastest samples
      expect(result.order.indexOf(sB)).toBeLessThanOrEqual(1);
      expect(result.order.indexOf(sA)).toBeLessThanOrEqual(1);
  
      // slowest samples
      expect(result.order.indexOf(sE)).toBeGreaterThanOrEqual(2);
      expect(result.order.indexOf(sF)).toBeGreaterThanOrEqual(2);
  
      // No rejections
      expect(result.rejected.length).toBe(0);
      
      // All samples are outliers because the effect-size is too large
      expect(result.outlier.length).toBe(4);
      expect(result.consistent.length).toBe(0);
    });
  
    test('maxEffectSize', () => {
      { // High threshold
        const a = postProcess(
          conflate([sA, sF], { maxEffectSize: 0.8, minSize: 2, maxSize: 10, exclusionMethod: 'slowest' })
        );
  
        expect(a.consistent).toEqual([sA, sF]);
        expect(a.outlier.length).toBe(0);
        expect(a.rejected.length).toBe(0);
      }
      { // Low threshold
        const a = postProcess(
          conflate([sA, sF], { maxEffectSize: 0.1, minSize: 2, maxSize: 10, exclusionMethod: 'slowest' })
        );
        
        expect(a.consistent).toEqual([]);
        expect(a.outlier.length).toBe(2);
        expect(a.rejected.length).toBe(0);
      }
    });
  });

  describe('exclusionMethod: "outliers"', () => {
    test('analysis() - cluster of 3, 1 reject', () => {
      const samples = [
        sD,
        sE,
        sA, // <-- outlier
        sF,
      ]
  
      const conflation = conflate(samples, {
        exclusionMethod: 'outliers',
        minSize: 2,
        maxSize: 3,
        maxEffectSize: 0.5,
      });

      const result = postProcess(conflation);
  
      // samples d, e, f
      expect(result.consistent.length).toBe(3);
      expect(result.consistent.includes(sA)).toBeFalsy();
  
      // The rejected sample is the last element
      expect(result.order.length).toEqual(4);
      expect(result.order[result.order.length - 1]).toBe(sA);
      expect(result.rejected).toEqual([sA]);
    });
  });

  test('maxSize', () => {
    const conflation = conflate(
      [sF, sB, sC, sD, sE, sA],
      { maxEffectSize: 1, maxSize: 4, minSize: 2, exclusionMethod: 'slowest' },
    );

    const a = postProcess(conflation);
    expect(a.order).toHaveValues([sA, sB, sC, sE, sD, sF]);
    expect(a.rejected).toEqual([sE, sF]);
    expect(a.consistent).toHaveValues([sA, sB, sC, sD]);
    expect(a.outlier).toEqual([]);
  });

  test('maxSize, maxEffectSize', () => {
    const conflation = conflate(
      [sF, sB, sC, sD, sE, sA],
      { maxEffectSize: 0.33, maxSize: 4, minSize: 2, exclusionMethod: 'slowest' }
    );

    const a = postProcess(conflation);
    expect(a.order).toHaveValues([sA, sB, sC, sE, sD, sF]);
    expect(a.rejected).toEqual([sE, sF]);
    expect(a.consistent).toEqual([]);
    expect(a.outlier).toHaveValues([sA, sB, sC, sD]);
  });
});
