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
