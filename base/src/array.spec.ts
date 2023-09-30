import * as array from './array.js';

describe('partitionEqual', () => {
  test('moves one value', () => {
    const arr = [5, -1, 4, 3, 2];
    const last = array.partitionEqual(arr, -1, 0, arr.length - 1);

    expect(last).toEqual(4);
    expect(arr).toEqual([5, 4, 3, 2, -1])
  });

  test('moves two values (a)', () => {
    const arr = [5, -1, 4, 3, -1, 2];
    const last = array.partitionEqual(arr, -1, 0, arr.length - 1);

    expect(last).toEqual(4);
    expect(arr).toEqual([5, 4, 3, 2, -1, -1])
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
});
