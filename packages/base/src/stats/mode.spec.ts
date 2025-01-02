import * as random from '../random.js';
import * as modes from './mode.js';
import * as bootstrap from './bootstrap.js';

describe('modalSearch', () => {
  test('creates a correctly sized window (2)', () => {
    const r = modes.modalSearch([1, 5, 6], 2, 0, 3);

    expect(r.range).toEqual([1, 2]);
    expect(r.ties).toEqual(0);
  });

  test('creates a correctly sized window (3)', () => {
    const r = modes.modalSearch([1, 5, 6], 3, 0, 3);

    expect(r.range).toEqual([0, 2]);
    expect(r.ties).toEqual(0);
  });

  test('counts ties', () => {
    const r = modes.modalSearch([1, 2, 3], 2, 0, 3);

    expect(r.range).toEqual([0, 1]);
    expect(r.ties).toEqual(1);
  });
});

describe('hsm', () => {
  test('finds one peak', () => {
    const gen = random.PRNGi32(34);
    const rng3 = random.gaussian(3, 0.25, gen);
    const rng6 = random.gaussian(6, 8, gen);
    const sample = new Float32Array(512);

    for (let i = 0; i < sample.length - 1; ) {
      sample[i++] = rng3();
      sample[i++] = rng6();
    }

    const r = modes.hsm(sample);
    expect(r.mode).toBeCloseTo(3, 1 / 4);
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

  test('shallow peak', () => {
    const sample = [1, 3, 4, 5, 6, 7, 8, 10];
    const r = modes.hsm(sample);

    expect(r.mode).toBeCloseTo(5.5, 10);
  });

  test('no peak', () => {
    const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = modes.hsm(sample);

    expect(r.mode).toBeCloseTo(4.5, 10);
  });

  describe('larger bounds', () => {
    test('bound length (3)', () => {
      const sample = [-10, 1, 2, 3, 10, 11];
      const r = modes.hsm(sample, 3);

      expect(r.bound).toEqual([1, 3]);
      expect(r.mode).toBeCloseTo((1 + 3) / 2, 10);
    });

    test('bound length (4)', () => {
      const sample = [0, 1, 1, 1, 1, 2];
      const r = modes.hsm(sample, 4);

      expect(r.bound).toEqual([1, 4]);
      expect(r.mode).toBeCloseTo(1, 10);
    });
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

    const [p05, p95] = bootstrap.differenceTest(x0, x1, x => modes.hsm(x).mode, 0.9, 1000);

    expect(p05).toBeInRange(-10, 5);
    expect(p95).toBeInRange(5, 15);
  });

  test('difference in two very similar normal distributions', () => {
    const rng = random.PRNGi32(52);
    const rng0 = random.gaussian(1000, 5, rng);
    const rng1 = random.gaussian(1000, 50, rng);

    const N = 100;
    const x0 = new Float32Array(N);
    const x1 = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      x0[i] = rng0();
      x1[i] = rng1();
    }

    const [p05, p95] = bootstrap.differenceTest(x0, x1, x => modes.hsm(x).mode, 0.9, 1000);

    expect(p05).toBeInRange(-50, 0);
    expect(p95).toBeInRange(0, 50);
  });
});

describe('estimateStdDev', () => {
  test('can estimate standard deviation', () => {
    const rng = random.PRNGi32(52);
    const rng0 = random.gaussian(1000, 5, rng);

    const N = 50_000;
    const x0 = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      x0[i] = rng0();
    }

    expect(modes.estimateStdDev(x0, 1)).toBeCloseTo(5, 1);
    expect(modes.estimateStdDev(x0, 0.5)).toBeCloseTo(5, 1);
    expect(modes.estimateStdDev(x0, 0.25)).toBeCloseTo(5, 0.5);
  });

  test('is robust to noise', () => {
    const rng = random.PRNGi32(52);
    const rng0 = random.gaussian(1000, 5, rng);
    const rng1 = random.gaussian(2000, 50, rng);

    const N = 50_000;
    const xs = new Float32Array(N);

    // 50% noise.
    for (let i = 0; i < N; ) {
      xs[i++] = rng0();
      xs[i++] = rng1();
    }

    // by looking at only the narrowest 5%, the std dev. of the modal value can
    // be estimated
    expect(modes.estimateStdDev(xs, 0.05)).toBeInRange(5, 10);
  });
});
