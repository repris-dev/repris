import { timer, random, iterator } from '@sampleci/base';
import * as duration from './duration.js';

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
  const sE = create(1000, 5, 250);
  const sF = create(1005, 5, 250);

  test('samples() - cluster of 3, 1 outlier', () => {
    const conf = new duration.DurationConflation();

    conf.push(sB);
    conf.push(sA);
    conf.push(sD); // <-- outlier
    conf.push(sC);

    const result = conf.analysis();

    // samples a, b, c
    expect(result.inAgreement.length).toBe(3);
    expect(result.inAgreement.includes(2)).toBeFalsy();

    // The outlier is also the slowest
    expect(result.order[result.order.length - 1]).toBe(2);
  });

  test('samples() - 2 clusters of 2', () => {
    const conf = new duration.DurationConflation();

    conf.push(sD);
    conf.push(sB);
    conf.push(sA);
    conf.push(sE);

    const result = conf.analysis();

    // No one cluster is large enough
    expect(result.inAgreement.length).toBe(0);

    // fastest samples
    expect(result.order.indexOf(1)).toBeLessThanOrEqual(1);
    expect(result.order.indexOf(2)).toBeLessThanOrEqual(1);

    // slowest samples
    expect(result.order.indexOf(0)).toBeGreaterThanOrEqual(2);
    expect(result.order.indexOf(3)).toBeGreaterThanOrEqual(2);
  });

  test('exclusionThreshold', () => {
    { // Low threshold
      const thresh = 0.2;
      const conf = new duration.DurationConflation(thresh);
  
      conf.push(sE);
      conf.push(sF);
      
      expect(conf.analysis().inAgreement.length).toBe(0);
    }
    { // high threshold
      const thresh = 0.8;
      const conf = new duration.DurationConflation(thresh);
  
      conf.push(sE);
      conf.push(sF);

      const a = conf.analysis();
      expect(a.inAgreement.length).toBe(2);
      expect(Array.from(a.order)).toEqual([0, 1]);
    }
  });
});

