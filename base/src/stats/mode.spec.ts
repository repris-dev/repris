import * as random from '../random.js';
import * as modes from './mode.js';

describe('hsm', () => {
  test('finds one peak', () => {
    const gen = random.PRNGi32(34);
    const rng3 = random.gaussian(3, 0.25, gen);
    const rng6 = random.gaussian(6, 8, gen);
    const sample = new Float32Array(128);

    for (let i = 0; i < sample.length - 1;) {
      sample[i++] = rng3();
      sample[i++] = rng6();
    }

    const r = modes.hsm(sample);
    expect(r.mode).toBeCloseTo(3, 1 / 3);
  });

  test('2 observations', () => {
    const r = modes.hsm([4, 5]);

    expect(r.mode).toBeCloseTo(4.5, 10);
    expect(r.bound).toEqual([0, 1]);
  });

  test('3 observations', () => {
    {
      const sample = [3, 10, 11];
      const r = modes.hsm(sample);

      expect(r.mode).toBeCloseTo(10.5, 10);
      expect(r.bound).toEqual([1, 2]);
    }
    {
      const sample = [3, 4, 11];
      const r = modes.hsm(sample);

      expect(r.mode).toBeCloseTo(3.5, 10);
      expect(r.bound).toEqual([0, 1]);
    }
  });

  test('4 observations', () => {
    {
      const sample = [1, 3, 10, 11];
      const r = modes.hsm(sample);

      expect(r.mode).toBeCloseTo(10.5, 10);
      expect(r.bound).toEqual([2, 3]);
    }
    {
      const sample = [1, 4, 5, 11];
      const r = modes.hsm(sample);

      expect(r.mode).toBeCloseTo(4.5, 10);
      expect(r.bound).toEqual([1, 2]);
    }
  });
});

describe('hsmDifferenceTest', () => {
  test('difference in two normal distributions', () => {
    const rng = random.PRNGi32(52);
    const rng0 = random.gaussian(105, 5, rng);
    const rng1 = random.gaussian(100, 5, rng);
    
    const N = 100;
    const x0 = new Float32Array(N);
    const x1 = new Float32Array(N);
    
    for (let i = 0; i < N; i++) {
      x0[i] = rng0();
      x1[i] = rng1();
    }
  
    const [p05, p95] = modes.hsmDifferenceTest(x0, x1, 0.9, 1000);
    expect(p05).toBeInRange(-10, 5);
    expect(p95).toBeInRange(5, 15);
  });

  test('difference in two very similar normal distributions', () => {
    const rng = random.PRNGi32(52)
    const rng0 = random.gaussian(1000, 5, rng);
    const rng1 = random.gaussian(1000, 50, rng);
    
    const N = 100;
    const x0 = new Float32Array(N);
    const x1 = new Float32Array(N);
    
    for (let i = 0; i < N; i++) {
      x0[i] = rng0();
      x1[i] = rng1();
    }
  
    const [p05, p95] = modes.hsmDifferenceTest(x0, x1, 0.9, 1000);
    expect(p05).toBeInRange(-50, 0);
    expect(p95).toBeInRange(0, 50);
  });
});
