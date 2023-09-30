import { timer, random, iterator } from '@sampleci/base';
import * as duration from '../samples/duration.js';
import { Duration, MWUConflationAnalysis, SampleStatus,  } from './duration.js';

const gen = random.PRNGi32(52);

function create(mean: number, std: number, size: number) {
  const rng3 = random.gaussian(mean, std, gen);
  const s = new duration.Duration();

  for (const x of iterator.take(size, iterator.gen(rng3))) {
    s.push(timer.cvtFrom(x, 'nanosecond'));
  }

  return s;
}

function postProcess(mwu: MWUConflationAnalysis) {
  const order = [];
  const a: Record<SampleStatus, number[]> = {
    consistent: [],
    rejected: [],
    outlier: [],
  }

  for (let s of mwu.stat) {
    order.push(s.index);
    a[s.status].push(s.index);
  }

  return { order, ...a, };
}

describe('DurationConflation', () => {
  const sA = create(300, 5, 250);
  const sB = create(300, 10, 250);
  const sC = create(300, 50, 250);
  const sD = create(1000, 2, 250);
  const sE = create(1000, 10, 250);
  const sF = create(1005, 10, 250);

  test('samples() - cluster of 3, 1 outlier', () => {
    const conf = new Duration();

    conf.push(sB);
    conf.push(sA);
    conf.push(sD); // <-- outlier
    conf.push(sC);

    const result = postProcess(conf.analysis());

    // samples a, b, c
    expect(result.consistent.length).toBe(3);
    expect(result.consistent.includes(2)).toBeFalsy();

    // The outlier is also the slowest
    expect(result.order.length).toEqual(4);
    expect(result.order[result.order.length - 1]).toBe(2);
  });

  test('samples() - 2 clusters of 2', () => {
    const conf = new Duration(
      [sF, sB, sA, sE],
      { maxEffectSize: 0.5, minConflationSize: 2 }
    );

    const result = postProcess(conf.analysis());

    // fastest samples
    expect(result.order.indexOf(1)).toBeLessThanOrEqual(1);
    expect(result.order.indexOf(2)).toBeLessThanOrEqual(1);

    // slowest samples
    expect(result.order.indexOf(3)).toBeGreaterThanOrEqual(2);
    expect(result.order.indexOf(0)).toBeGreaterThanOrEqual(2);

    // No rejections
    expect(result.rejected.length).toBe(0);
    
    // The slower cluster are outliers
    expect(result.outlier.length).toBe(2);
    expect(result.outlier).toHaveValues([0, 3]);

    // The faster cluster is selected
    expect(result.consistent.length).toBe(2);
    expect(result.consistent).toHaveValues([1, 2]);
  });

  test('maxEffectSize', () => {
    { // High threshold
      const conf = new Duration([sA, sF], { maxEffectSize: 0.8 });
      const a = postProcess(conf.analysis());

      expect(a.consistent).toEqual([0, 1]);
      expect(a.outlier.length).toBe(0);
      expect(a.rejected.length).toBe(0);
    }
    { // Low threshold
      const conf = new Duration([sA, sF], { maxEffectSize: 0.1 });
      const a = postProcess(conf.analysis());
      
      expect(a.consistent).toEqual([]);
      expect(a.rejected.length).toBe(0);
    }
  });

  test('minConflationSize', () => {
    const conf = new Duration(
      [sF, sB, sA, sC, sE],
      { maxEffectSize: 0.5, minConflationSize: 3 }
    );

    const a = postProcess(conf.analysis());

    // consistent samples
    expect(a.consistent.length).toBe(3);
    expect(a.consistent).toHaveValues([1, 2, 3]);
    
    expect(a.outlier.length).toBe(2);
    expect(a.outlier).toHaveValues([0, 4]);

    expect(a.rejected.length).toBe(0);
  });

  test('maxSize', () => {
    const conf = new Duration([sA, sB, sC, sD, sE, sF], { maxEffectSize: 1, maxCacheSize: 4 });
    const a = postProcess(conf.analysis());

    expect(a.order).toHaveValues([0, 1, 2, 3, 4, 5]);
    expect(a.rejected).toEqual([4, 5]);
    expect(a.consistent).toHaveValues([0, 1, 2, 3]);
    expect(a.outlier).toEqual([]);
  });
});

