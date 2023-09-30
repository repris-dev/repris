import * as random from '../random.js';
import * as kde from './kde.js';
import OnlineStats from './OnlineStats.js';
import { iqr } from './util.js';

describe('kde', () => {
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
      OnlineStats.fromValues(sample).std(),
      sample.length,
      iqr(sample)
    );
    
    const [maxi] = kde.findMaxima(kde.gaussian, sample, h);
    expect(sample[maxi]).toBeCloseTo(3, 1 / 3);
  });
});

