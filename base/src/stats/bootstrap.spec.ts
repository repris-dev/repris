import * as boot from './bootstrap.js';
import * as rand from '../random.js';
import * as os from './OnlineStats.js'

describe('resampler', () => {
  test('Estimate std deviation', () => {
    const rng = rand.PRNGi32(31);
    const dist = rand.gaussian(2, 10, rng);
    const N = 100;

    const xs = new Float32Array(N);
    for (let i = 0; i < N; i++) xs[i] = dist();

    const resampler = boot.resampler(xs, rng);
    const sample = new os.Gaussian();
    const K = 10_000;

    for (let k = 0; k < K; k++) {
      const mean = new os.Gaussian();
      const resample = resampler();
      
      for (let i = 0; i < resample.length; i++) {
        mean.push(resample[i]);
      }

      sample.push(mean.mean());
    }

    const std = Math.sqrt(N) * sample.std();
    expect(std).toBeInRange(9, 11);
  });
});
