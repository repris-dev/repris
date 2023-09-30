import { createOutlierSelection } from './kruskal.js';

describe('outlierSelection', () => {
  const xs = [5.5, 5.4, 5.3, 3.4, 3, 2.2, 2.1, 2, 1.2, 1, 1.1, 1.3, 0.2, 0.1, 0];

  test('Rejects values once', () => {
    const fn = createOutlierSelection<number>(xs, x => x);
    const seen = new Set<number>();

    for (let i = 0; i < xs.length; i++) {
      const x = fn();
      expect(typeof x === 'number').toEqual(true);
      expect(seen.has(x!)).toEqual(false);

      seen.add(x!);
    }

    expect(fn()).toEqual(undefined);
  });
});
