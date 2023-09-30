import * as iterator from './iterator.js';

test('cartesianProduct()', () => {
  {
    const iter = iterator.cartesianProduct([['a', 'b'], ['c', 'd']]);
    expect(iterator.collect(iter)).toEqual(
      [['a', 'c'], ['b', 'c'], ['a', 'd'], ['b', 'd']]);
  }
  {
    const iter = iterator.cartesianProduct([['a'], ['b', 'c']]);
    expect(iterator.collect(iter)).toEqual(
      [['a', 'b'], ['a', 'c']]);
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
