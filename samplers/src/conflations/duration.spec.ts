import { timer, random, iterator } from '@sampleci/base';
import * as duration from '../samples/duration.js';
import { Duration } from './duration.js';

const gen = random.PRNGi32(52);

function create(mean: number, std: number, size: number) {
  const rng3 = random.gaussian(mean, std, gen);
  const s = new duration.Duration();

  for (const x of iterator.take(size, iterator.gen(rng3))) {
    s.push(timer.cvtFrom(x, 'nanosecond'));
  }

  return s;
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

    const result = conf.analysis();

    // samples a, b, c
    expect(result.consistentSubset.length).toBe(3);
    expect(result.consistentSubset.includes(2)).toBeFalsy();

    // The outlier is also the slowest
    expect(result.ordered[result.ordered.length - 1]).toBe(2);
  });

  test('samples() - 2 clusters of 2', () => {
    const conf = new Duration(
      [sF, sB, sA, sE],
      { minSimilarity: 0.5 }
    );

    const result = conf.analysis();

    // The more-similar cluster is selected
    expect(result.consistentSubset.length).toBe(2);
    expect(result.consistentSubset).toContain(1);
    expect(result.consistentSubset).toContain(2);

    // fastest samples
    expect(result.ordered.indexOf(1)).toBeLessThanOrEqual(1);
    expect(result.ordered.indexOf(2)).toBeLessThanOrEqual(1);

    // slowest samples
    expect(result.ordered.indexOf(3)).toBe(2);
    expect(result.ordered.indexOf(0)).toBe(3);
  });

  test('minSimilarity', () => {
    { // High threshold
      const conf = new Duration([sE, sF], { minSimilarity: 0.8 });
      expect(conf.analysis().consistentSubset.length).toBe(0);
    }
    { // Low threshold
      const conf = new Duration([sE, sF], { minSimilarity: 0.2 });
  
      const a = conf.analysis();
      expect(a.consistentSubset.length).toBe(2);
      expect(Array.from(a.ordered)).toEqual([0, 1]);
    }
  });

  test('maxSize', () => {
    {
      const conf = new Duration([sA, sB, sC, sD, sE, sF], { minSimilarity: 0, maxSize: 4 });
      const a = conf.analysis();

      expect(a.excluded).toEqual([4, 5]);
      expect(Array.from(a.ordered.sort())).toEqual([0, 1, 2, 3, 4, 5]);
      expect(Array.from(a.consistentSubset.sort())).toEqual([0, 1, 2, 3]);
    }
    {
      const conf = new Duration([sA, sB], { minSimilarity: 0, maxSize: 4 });
      const a = conf.analysis();

      expect(a.excluded).toEqual([]);
      expect(Array.from(a.ordered.sort())).toEqual([0, 1]);
      expect(Array.from(a.consistentSubset.sort())).toEqual([0, 1]);
    }
  });
});

