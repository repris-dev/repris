import * as iter from '../iterator.js';
import * as random from '../random.js';
import { ArrayView } from '../array.js';
import * as allPairs from './allPairs.js';

function simpleSuite(analyse: (sample: ArrayView<number>) => allPairs.RobustScale) {
  test('3 observations', () => {
    const sample = [-2, -2, -2];
    const sn = analyse(sample);

    expect(sn.spread).toEqual(0);
  });

  test('2 observations', () => {
    const sample = [50, 52];
    const sn = analyse(sample);

    expect(sn.spread).toEqual(2);
  });

  test('1 observation', () => {
    const sample = [20];
    const sn = analyse(sample);

    expect(sn.spread).toEqual(0);
  });
}

describe('crouxSn', () => {
  simpleSuite(allPairs.crouxSn);

  test('5 observations', () => {
    const sample = [1, 2, 2, 3, 5];
    const sn = allPairs.crouxSn(sample);

    /*

        | 1  2  2  3  5  hi-med
      --|----------------------
      1 | 0  1  1  2  4    2
      2 | 1  0  0  1  3    1
      2 | 1  0  0  1  3    1
      3 | 2  1  1  0  2    2
      5 | 4  3  3  2  0    3
  
      lo-med = 2

    */
    expect(sn.spread).toEqual(2);
  });

  test('gaussian', () => {
    const entropy = random.PRNGi32(51);

    // mean=500, s.d.=100, n=500
    const sample1 = new Float32Array(iter.gen(random.gaussian(500, 100, entropy), 500));

    const scale1 = allPairs.crouxSn(sample1);
    expect(scale1.correctedSpread).toBeInRange(99, 101);

    // mean=500, s.d.=1000, n=100
    const sample2 = new Float32Array(iter.gen(random.gaussian(500, 1000, entropy), 100));

    const scale2 = allPairs.crouxSn(sample2);
    expect(scale2.correctedSpread).toBeInRange(950, 1050);

    // 2 samples, mixed
    const sample12 = new Float32Array(iter.concat([sample1, sample2]));

    // expect a small s.d.
    const scale12 = allPairs.crouxSn(sample12);
    expect(scale12.correctedSpread).toBeInRange(100, 150);
  });

  test('gaussian, small sample', () => {
    const entropy = random.PRNGi32();

    // mean=100, s.d.=10, n=20
    const sample1 = new Float32Array(iter.gen(random.gaussian(100, 10, entropy), 20));
    const scale1 = allPairs.crouxQn(sample1);

    // mean=1000, s.d.=10, n=10
    const sample2 = new Float32Array(iter.gen(random.gaussian(1000, 10, entropy), 10));
    const scale2 = allPairs.crouxQn(sample2);

    // 2 samples, mixed
    const sample12 = new Float32Array(iter.concat([sample1, sample2]));
    const scale12 = allPairs.crouxQn(sample12);

    // expect a larger s.d. than either of the two samples
    expect(scale12.correctedSpread).toBeGreaterThan(scale1.correctedSpread);
    expect(scale12.correctedSpread).toBeGreaterThan(scale2.correctedSpread);
  });
});

describe('crouxQn', () => {
  simpleSuite(allPairs.crouxQn);

  test('5 observations', () => {
    const sample = [1, 2, 2, 3, 5];
    const qn = allPairs.crouxQn(sample);

    /*

    pairs: 1  1  2  4  0  1  3  1  3  2
    sort:  0  1  1  1  1  2  2  3  3  4
                    ^  
    */
    expect(qn.spread).toEqual(1);
  });

  test('gaussian', () => {
    const entropy = random.PRNGi32(51);

    // mean=500, s.d.=100, n=500
    const sample1 = new Float32Array(iter.gen(random.gaussian(500, 100, entropy), 500));

    const scale1 = allPairs.crouxQn(sample1);
    expect(scale1.correctedSpread).toBeInRange(99.5, 100.5);

    // mean=500, s.d.=1000, n=100
    const sample2 = new Float32Array(iter.gen(random.gaussian(500, 1000, entropy), 100));

    const scale2 = allPairs.crouxQn(sample2);
    expect(scale2.correctedSpread).toBeInRange(975, 1025);

    // 2 samples mixed
    const sample12 = new Float32Array(iter.concat([sample1, sample2]));

    // expect a small s.d.
    const scale12 = allPairs.crouxQn(sample12);
    expect(scale12.correctedSpread).toBeInRange(100, 150);
  });
});
