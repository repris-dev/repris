import { iterator } from './index.js';
import * as part from './partitioning.js';

describe('from()', () => {
  test('unions 2 vertices', () => {
    const p = part.from([[0, 1]], 2);

    expect(p.size).toBe(2);
    expect(p.countGroups()).toBe(1);
    expect(p.get(0)).toBe(0);
    expect(p.get(1)).toBe(0);

    expect(iterator.collect(p.iterateGroup(0))).toEqual([0, 1]);
    expect(iterator.collect(p.iterateGroup(1))).toEqual([0, 1]);

    expect(p.groupSize(0)).toEqual(2);
    expect(p.groupSize(1)).toEqual(2);
  });

  test('two components', () => {
    const p = part.from(
      [
        [0, 3],
        [1, 2],
      ],
      4,
    );

    expect(p.countGroups()).toBe(2);

    expect(p.get(0)).toBe(0);
    expect(p.get(3)).toBe(0);
    expect(p.get(1)).toBe(1);
    expect(p.get(2)).toBe(1);

    expect(iterator.collect(p.iterateGroup(0))).toEqual([0, 3]);
    expect(iterator.collect(p.iterateGroup(3))).toEqual([0, 3]);
    expect(iterator.collect(p.iterateGroup(1))).toEqual([1, 2]);
    expect(iterator.collect(p.iterateGroup(2))).toEqual([1, 2]);
  });

  test('three components', () => {
    const p = part.from([], 3);

    expect(p.countGroups()).toBe(3);
    expect(p.size).toBe(3);

    expect(p.get(0)).toBe(0);
    expect(p.get(1)).toBe(1);
    expect(p.get(2)).toBe(2);

    expect(iterator.collect(p.iterateGroup(0))).toEqual([0]);
  });

  test('zero vertices', () => {
    const p = part.from([], 0);

    expect(p.size).toBe(0);
    expect(p.countGroups()).toBe(0);
  });

  test('filters invalid edges', () => {
    const p = part.from(
      [
        [-1, 0],
        [1, -1],
        [2, 2],
        [3, 4],
      ],
      5,
    );

    expect(p.size).toBe(5);
    expect(p.countGroups()).toBe(4);
    expect(p.groupSize(0)).toBe(1);
    expect(p.groupSize(1)).toBe(1);
    expect(p.groupSize(2)).toBe(1);
    expect(p.groupSize(3)).toBe(2);
    expect(p.groupSize(4)).toBe(2);
  });
});
