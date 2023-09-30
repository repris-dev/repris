function shuffle(array: Int32Array) {
  let currentIdx = array.length;

  while (currentIdx !== 0) {
    const randomIdx = Math.floor(Math.random() * currentIdx);
    currentIdx--;

    // And swap it with the current element.
    const a = array[currentIdx];
    array[currentIdx] = array[randomIdx];
    array[randomIdx] = a;
  }

  return array;
}

describe('shuffle()', () => {
  sample('numbers', (s) => {
    const n = 1e5;
    const arr = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      arr[i] = i;
    }

    for (let _ of s) {
      shuffle(arr);
    }

    expect(arr[0]).toBeGreaterThan(0);
  });
});
