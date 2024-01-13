import { random, array } from '@repris/base';

describe('shuffle() (PRNG)', () => {
  bench.each([10, 1e5, 5e5])('n=%s', (s, n) => {
    const rng = random.PRNGi32(67);
    const arr = array.iota(new Int32Array(n), 0);

    for (let _ of s) array.shuffle(arr, rng);

    expect(arr[0]).toBeGreaterThan(-1);
  });
});
