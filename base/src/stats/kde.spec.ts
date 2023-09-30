import * as random from '../random.js';
import * as kde from './kde.js';
import * as OS from './OnlineStats.js';
import { iqr } from './util.js';

describe('findMaxima', () => {
  test('finds one peak', () => {
    const gen = random.PRNGi32(34);
    const rng3 = random.gaussian(3, 0.25, gen);
    const rng6 = random.gaussian(6, 8, gen);
    const sample = new Float32Array(128);

    for (let i = 0; i < sample.length - 1;) {
      sample[i++] = rng3();
      sample[i++] = rng6();
    }

    const h = kde.silvermansRule(
      OS.Gaussian.fromValues(sample).std(),
      sample.length,
      iqr(sample)
    );
    
    const [maxi] = kde.findMaxima(kde.gaussian, sample, h);
    expect(sample[maxi]).toBeCloseTo(3, 1 / 3);
  });
});

test('gaussian kernel', () => {
  const d = kde.estimate(kde.gaussian, [100], 1, 100);
  expect(d).toBeCloseTo(0.3989, 4);

  // +1 standard deviation from the mean
  const d1 = kde.estimate(kde.gaussian, [100], 1, 101);
  expect(d1).toBeCloseTo(0.242, 4);

  // -1 standard deviation from the mean
  const d2 = kde.estimate(kde.gaussian, [100], 1, 99);
  expect(d2).toBeCloseTo(0.242, 4);

  const d3 = kde.estimate(kde.gaussian, [100, 100], 1, 100);
  expect(d3).toBeCloseTo(0.3989, 4);
});
