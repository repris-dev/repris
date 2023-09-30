import { random, array } from '@repris/base';

function shuffle(array: Int32Array, rng: random.Generator) {
  const dist = random.uniform(0, 1, rng);
  let currentIdx = array.length;

  while (currentIdx !== 0) {
    const randomIdx = Math.floor(dist() * currentIdx);
    currentIdx--;

    // And swap it with the current element.
    const a = array[currentIdx];
    array[currentIdx] = array[randomIdx];
    array[randomIdx] = a;
  }

  return array;
}

describe('shuffle() (PRNG)', () => {
  bench.each([[10], [1e5], [5e5]])('n=%s', (s, n) => {
    const rng = random.PRNGi32(67);
    const arr = array.iota(new Int32Array(n), 0);

    for (let _ of s) shuffle(arr, rng);

    expect(arr[0]).toBeGreaterThan(-1);
  });
});
