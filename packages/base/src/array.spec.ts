import * as array from './array.js';
import { random } from './index.js';

describe('lowerBound', () => {
  const arr = [1, 3, 5, 7, 9];
  const lt = (needle: number, x: number) => needle < x;

  it('returns the correct index when the value is found', () => {
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      const idx = array.lowerBound(arr, x, lt);
      expect(idx).toEqual(i);
    }
  });

  it('returns the index of the first element greater than the value', () => {
    const index = array.lowerBound(arr, 6, lt);
    expect(index).toEqual(3);
  });

  it('returns the index of the first element greater than the value (b)', () => {
    const index = array.lowerBound([1, 2, 2, 2, 3], 2, lt);
    expect(index).toEqual(1);
  });

  it('returns the index beyond last element when the value is greater than all elements', () => {
    const index = array.lowerBound(arr, 10, lt);
    expect(index).toEqual(5);
  });

  it('returns the index of the first element when the value is less than all elements', () => {
    const index = array.lowerBound(arr, 0, lt);
    expect(index).toEqual(0);
  });

  it('handles an empty array', () => {
    expect(array.lowerBound([], 0, lt)).toEqual(0);
  });
});

describe('partitionEqual', () => {
  test('moves one value', () => {
    const arr = [5, -1, 4, 3, 2];
    const last = array.partitionEqual(arr, -1, 0, arr.length - 1);

    expect(last).toEqual(4);
    expect(arr).toEqual([5, 4, 3, 2, -1]);
  });

  test('moves two values (a)', () => {
    const arr = [5, -1, 4, 3, -1, 2];
    const last = array.partitionEqual(arr, -1, 0, arr.length - 1);

    expect(last).toEqual(4);
    expect(arr).toEqual([5, 4, 3, 2, -1, -1]);
  });

  test('moves two values (b)', () => {
    const arr = [5, -1, 4, 3, 2, -1];
    const last = array.partitionEqual(arr, -1, 0, arr.length - 1);

    expect(last).toEqual(4);
    expect(arr).toEqual([5, 4, 3, 2, -1, -1]);
  });

  test('moves three values', () => {
    const arr = [-1, -1, 4, 3, -1, 2];
    const last = array.partitionEqual(arr, -1, 0, arr.length - 1);

    expect(last).toEqual(3);
    expect(arr).toEqual([4, 3, 2, -1, -1, -1]);
  });

  test('moves one value within a subset', () => {
    const arr = [5, -1, 4, 3, 2, -1];
    const last = array.partitionEqual(arr, -1, 0, 3);

    expect(last).toEqual(3);
    expect(arr).toEqual([5, 4, 3, -1, 2, -1]);
  });

  test('moves two values within a subset', () => {
    const arr = [-1, -1, 4, 3, 2, 1];
    const last = array.partitionEqual(arr, -1, 0, 3);

    expect(last).toEqual(2);
    expect(arr).toEqual([4, 3, -1, -1, 2, 1]);
  });

  test('moves zero values', () => {
    const arr = [6, 5, 4, 3, 2, 1];

    expect(array.partitionEqual(arr, -1, 0, arr.length - 1)).toEqual(-1);
    expect(array.partitionEqual(arr, -1, 1, 3)).toEqual(-1);
  });
});

describe('quickSelect', () => {
  test('finds values', () => {
    const arr = [5, 5, 3, 2, 1];

    {
      const idx = array.quickselect(arr, 4);
      expect(arr[idx]).toBe(5);
    }
    {
      const idx = array.quickselect(arr, 3);
      expect(arr[idx]).toBe(5);
    }
    {
      const idx = array.quickselect(arr, 2);
      expect(arr[idx]).toBe(3);
    }
    {
      const idx = array.quickselect(arr, 1);
      expect(arr[idx]).toBe(2);
    }
    {
      const idx = array.quickselect(arr, 0);
      expect(arr[idx]).toBe(1);
    }
  });

  test('finds values (2)', () => {
    const rng = random.PRNGi32(55);
    const arr = array.iota(new Float32Array(1000), 0)

    for (let i = 0; i < 1000; i++) {
      array.shuffle(arr, rng);
      expect(array.quickselect(arr, i)).toEqual(i);
    }
  })
});

describe('removeAtIndices', () => {
  const arr = ['a', 'b', 'c'];

  test('remove one index', () => {
    const a = arr.slice();

    const len = array.removeAtIndices(a, [1]);
    expect(len).toBe(2);

    a.length = len;
    expect(a).toEqual(['a', 'c']);
  });

  test('remove two index', () => {
    const a = arr.slice();

    const len = array.removeAtIndices(a, [0, 2]);
    expect(len).toBe(1);

    a.length = len;
    expect(a).toEqual(['b']);
  });

  test('remove three index', () => {
    const a = arr.slice();

    const len = array.removeAtIndices(a, [0, 1, 2]);
    expect(len).toBe(0);

    a.length = len;
    expect(a).toEqual([]);
  });
});
