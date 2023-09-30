import { timer, random, iterator } from '@repris/base';
import * as duration from '../samples/duration.js';
import { Conflation, Duration } from './duration.js';
import { ConflatedSampleStatus } from './types.js';

const gen = random.PRNGi32(52);

function create(mean: number, std: number, size: number) {
  const rng3 = random.gaussian(mean, std, gen);
  const s = new duration.Duration();

  for (const x of iterator.take(size, iterator.gen(rng3))) {
    s.push(timer.cvtFrom(x, 'nanosecond'));
  }

  return s;
}

function postProcess(mwu: Conflation) {
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

  describe('exclusionMethod: "outliers"', () => {
    test('analysis() - cluster of 3, 1 outlier', () => {
      const conf = new Duration();
  
      conf.push(sD);
      conf.push(sE);
      conf.push(sA); // <-- outlier
      conf.push(sF);
  
      const result = postProcess(conf.analyze({ minSize: 2, maxEffectSize: 0.5, exclusionMethod: 'outliers' }));
  
      // samples d, e, f
      expect(result.consistent.length).toBe(3);
      expect(result.consistent.includes(sA)).toBeFalsy();
  
      // The outlier is the last element
      expect(result.order.length).toEqual(4);
      expect(result.order[result.order.length - 1]).toBe(sA);

      expect(result.outlier).toEqual([sA]);
    });
  });

  test('analysis() - cluster of 3, 1 outlier', () => {
    const conf = new Duration();

    conf.push(sB);
    conf.push(sA);
    conf.push(sD); // <-- outlier
    conf.push(sC);

    const result = postProcess(
      conf.analyze({ minSize: 2, exclusionMethod: 'slowest' })
    );

    // samples a, b, c
    expect(result.consistent.length).toBe(3);
    expect(result.consistent.includes(sD)).toBeFalsy();

    // The outlier is also the slowest
    expect(result.order.length).toEqual(4);
    expect(result.order[result.order.length - 1]).toBe(sD);
  });

  test('analysis() - 2 clusters of 2', () => {
    const conf = new Duration(
      [sF, sB, sA, sE],
    );

    const result = postProcess(
      conf.analyze({ maxEffectSize: 0.5, minSize: 2, exclusionMethod: 'slowest' })
    );

    // fastest samples
    expect(result.order.indexOf(sB)).toBeLessThanOrEqual(1);
    expect(result.order.indexOf(sA)).toBeLessThanOrEqual(1);

    // slowest samples
    expect(result.order.indexOf(sE)).toBeGreaterThanOrEqual(2);
    expect(result.order.indexOf(sF)).toBeGreaterThanOrEqual(2);

    // No rejections
    expect(result.rejected.length).toBe(0);
    
    // The sparser cluster are outliers
    expect(result.outlier.length).toBe(2);
    expect(result.outlier).toHaveValues([sF, sE]);

    // The denser cluster is selected
    expect(result.consistent.length).toBe(2);
    expect(result.consistent).toHaveValues([sB, sA]);
  });

  test('maxEffectSize', () => {
    { // High threshold
      const conf = new Duration([sA, sF]);
      const a = postProcess(
        conf.analyze({ maxEffectSize: 0.8, minSize: 2, exclusionMethod: 'slowest' })
      );

      expect(a.consistent).toEqual([sA, sF]);
      expect(a.outlier.length).toBe(0);
      expect(a.rejected.length).toBe(0);
    }
    { // Low threshold
      const conf = new Duration([sA, sF]);
      const a = postProcess(
        conf.analyze({ maxEffectSize: 0.1, minSize: 2, exclusionMethod: 'slowest' })
      );
      
      expect(a.consistent).toEqual([]);
      expect(a.rejected.length).toBe(0);
    }
  });

  test('minSize', () => {
    const conf = new Duration([sF, sB, sA, sC, sE]);
    const a = postProcess(conf.analyze({ maxEffectSize: 0.5, minSize: 3 }));

    // consistent samples
    expect(a.consistent.length).toBe(3);
    expect(a.consistent).toHaveValues([sB, sA, sC]);
    
    expect(a.outlier.length).toBe(2);
    expect(a.outlier).toHaveValues([sF, sE]);

    expect(a.rejected.length).toBe(0);
  });

  test('maxSize', () => {
    const conf = new Duration([sF, sB, sC, sD, sE, sA]);
    const a = postProcess(conf.analyze({ maxEffectSize: 1, maxSize: 4, minSize: 2, exclusionMethod: 'slowest' }));

    expect(a.order).toHaveValues([sA, sB, sC, sE, sD, sF]);
    expect(a.rejected).toEqual([sE, sF]);
    expect(a.consistent).toHaveValues([sA, sB, sC, sD]);
    expect(a.outlier).toEqual([]);
  });

  test('maxSize, maxEffectSize', () => {
    const conf = new Duration([sF, sB, sC, sD, sE, sA]);
    const a = postProcess(conf.analyze({ maxEffectSize: 0.33, maxSize: 4, minSize: 2, exclusionMethod: 'slowest' }));

    expect(a.order).toHaveValues([sA, sB, sC, sE, sD, sF]);
    expect(a.rejected).toEqual([sE, sF]);
    expect(a.consistent).toHaveValues([sA, sB, sC]);
    expect(a.outlier).toEqual([sD]);
  });
});

