import * as util from './util.js';

describe('iqr', () => {
  test('finds range (even sample size)', () => {
    const arr = [0, 2, 1, 4, 3,   5, 7, 6, 9, 8];
    const range = util.iqr(arr);

    expect(range).toEqual([2, 7]);
  });

  test('finds range (odd sample size)', () => {
    const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const range = util.iqr(arr);

    expect(range).toEqual([2, 6]);
  });

  test('finds range (odd sample size)', () => {
    const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const range = util.iqr(arr);

    expect(range).toEqual([2, 6]);
  });

  test('finds range (N=1)', () => {
    const arr = [0];
    const range = util.iqr(arr);

    expect(range).toEqual([0, 0]);
  });
});

describe('median', () => {
  test('even sample size', () => {
    const arr = [0, 1, 2, 3];
    const m = util.median(arr);

    expect(m).toEqual(1.5);
  });

  test('even sample size (2)', () => {
    const arr = [100, 200];
    const m = util.median(arr);

    expect(m).toEqual(150);
  });

  test('odd sample size', () => {
    const arr = [0, 1, 2];
    const m = util.median(arr);

    expect(m).toEqual(1);
  });

  test('odd sample size (2)', () => {
    const arr = [100];
    const m = util.median(arr);

    expect(m).toEqual(100);
  });
});
