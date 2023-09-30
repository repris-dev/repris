describe('Set<T>', () => {
  sample('.add()', (s) => {
    for (let _ of s) {
      const set = new Set()
      for (let i = 0; i < 10000; i++) {
        set.add(i);
      }
      expect(set.size).toBe(10000);
    }
  });

  sample('.forEach()', (s) => {
    const set = new Set<number>()
    for (let i = 0; i < 10000; i++) {
      set.add(i);
    }

    let total = 0;
    for (let _ of s) {
      set.forEach((v) => { total += v; })
    }

    expect(total).toBeGreaterThan(0);
  });
});

describe('Map<K, V>', () => {
  sample('.set()', (s) => {
    for (let _ of s) {
      const map = new Map()
      for (let i = 0; i < 10000; i++) {
        map.set(i, 2 * i);
      }
      expect(map.size).toBe(10000);
    }
  });
});
