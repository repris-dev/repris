import * as iterator from './iterator.js';

test('cartesianProduct()', () => {
  {
    const iter = iterator.cartesianProduct([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(iterator.collect(iter)).toEqual([
      ['a', 'c'],
      ['b', 'c'],
      ['a', 'd'],
      ['b', 'd'],
    ]);
  }
  {
    const iter = iterator.cartesianProduct([['a'], ['b', 'c']]);
    expect(iterator.collect(iter)).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ]);
  }
  {
    const iter = iterator.cartesianProduct([['a']]);
    expect(iterator.collect(iter)).toEqual([['a']]);
  }
  {
    const iter = iterator.cartesianProduct([]);
    expect(iterator.collect(iter)).toEqual([[]]);
  }
});

describe('range', () => {
  test('1 value', () => {
    const iter = iterator.range(4, 1);
    expect(Array.from(iter)).toEqual([4]);
  });

  test('2 values', () => {
    const iter = iterator.range(4, 2);
    expect(Array.from(iter)).toEqual([4, 5]);
  });

  test('0 values', () => {
    const iter = iterator.range(4, 0);
    expect(Array.from(iter)).toEqual([]);
  });
});

describe('subspan', () => {
  test('1 value', () => {
    const iter = iterator.subSpan(['a', 'b', 'c'], 1, 1);
    expect(Array.from(iter)).toEqual(['b']);
  });

  test('2 values', () => {
    const iter = iterator.subSpan(['a', 'b', 'c'], 1, 2);
    expect(Array.from(iter)).toEqual(['b', 'c']);
  });

  test('0 values', () => {
    const iter = iterator.subSpan(['a'], 0, 0);
    expect(Array.from(iter)).toEqual([]);
  });
});

describe('outerJoin', () => {
  test('paired values', () => {
    const iter = iterator.outerJoin(['a', 'b', 'c'], ['b', 'c', 'a'], x => x);
    expect(Array.from(iter)).toEqual([
      ['a', 'a'],
      ['b', 'b'],
      ['c', 'c'],
    ]);
  });

  test('unpaired values', () => {
    const iter = iterator.outerJoin(['a', 'b', 'c'], ['d', 'e', 'f'], x => x);
    expect(Array.from(iter)).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['c', undefined],
      [undefined, 'd'],
      [undefined, 'e'],
      [undefined, 'f'],
    ]);
  });

  test('mixed', () => {
    const iter = iterator.outerJoin(['a1', 'b1', 'c1'], ['a2', 'e2', 'b2'], x => x[0]);
    expect(Array.from(iter)).toEqual([
      ['a1', 'a2'],
      ['b1', 'b2'],
      ['c1', undefined],
      [undefined, 'e2'],
    ]);
  });

  test('one sided (a)', () => {
    const iter = iterator.outerJoin(['a1'], [], x => x[0]);
    expect(Array.from(iter)).toEqual([['a1', undefined]]);
  });

  test('one sided (b)', () => {
    const iter = iterator.outerJoin(['b1'], [], x => x[0]);
    expect(Array.from(iter)).toEqual([['b1', undefined]]);
  });
});

describe('reduce', () => {
  test('two elements', () => {
    const a = {} as Record<string, number>;
    const result = iterator.reduce([1, 2], (acc, x) => {
      expect(acc).toBe(a);
      acc[x] = x;

      return a;
    }, a);

    expect(result).toEqual({ '1': 1, '2': 2 });
  });
});
