import * as assert from './assert.js';

/* A mutable equivalent of ArrayLike<T> */
export interface Indexable<T> {
  readonly length: number;
  [n: number]: T;
}

type BinaryPredicate<T, T2 = T> = (a: T, b: T2) => boolean;

export function lessThan(a: number | string, b: number | string) {
  return a < b
};

/** @return true if @param a is a typed array */
export function isTypedArray(a: any): boolean {
  return a.buffer && a.buffer instanceof ArrayBuffer;
}

/** Sets all values in an array to the given value */
export function fill<T>(arr: Indexable<T>, val: T): void {
  for (let i = 0; i < arr.length; i++) { arr[i] = val; }
}

/** Sets all values in in increments of 1 */
export function fillAscending<T extends Indexable<number>>(arr: T, initial: number): T {
  for (let i = 0; i < arr.length; i++) { arr[i] = initial++; }
  return arr;
}

/** Copy values from src to dest */
export function copyTo<T>(src: Indexable<T>, dest: Indexable<T>): void {
  const n = Math.min(src.length, dest.length);
  for (let i = 0; i < n; i++) { dest[i] = src[i]; }
}

/** Collect a subset of values from src to dest */
export function copySubsetTo<T>(
  src: Indexable<T>,
  indices: Indexable<number>,
  dest: Indexable<T>,
): void {
  const n = Math.min(indices.length, dest.length);
  for (let i = 0; i < n; i++) { dest[i] = src[indices[i]]; }
}

/** Push a subset of src to dest */
export function subsetOf<T, P extends { push(val: T): any }>(
  src: Indexable<T>,
  indices: Indexable<number>,
  dest: P,
): P {
  const n = indices.length;
  for (let i = 0; i < n; i++) {
    dest.push(src[indices[i]]);
  }
  return dest;
}

export function swap<T>(arr: Indexable<T>, adx: number, bdx: number) {
  assert.is(adx >= 0 && adx < arr.length && bdx >= 0 && bdx < arr.length);

  const tmp = arr[adx];
  arr[adx] = arr[bdx];
  arr[bdx] = tmp;
}

export function shift<T>(values: Indexable<T>, from: number, to: number) {
  assert.gt(values.length, from);
  assert.gt(values.length, to);

  const direction = from > to ? -1 : 1;

  let i = values.length - 1;
  let last = values[from];

  while (i !== to) {
    values[i - 1] = values[i];
    i += direction;
  }
  values[i] = last;
}

export function concat<T>(arrs: Indexable<Indexable<T>>, dest: T[] = []): T[] {
  for (let i = 0; i < arrs.length; i++) {
    const arr = arrs[i];
    for (let j = 0; j < arr.length; j++) {
      dest.push(arr[j]);
    }
  }
  return dest;
}

export function push<T>(dest: T[], src: Indexable<T>): T[] {
  for (let i = 0; i < src.length; i++) {
    dest.push(src[i]);
  }
  return dest;
}

export function sort<T extends number>(xs: Indexable<T>) {
  Array.prototype.sort.call(xs, (a, b) => a - b);
}

/**
 * Returns the index of the first element in the range that
 * is not less than (i.e. greater or equal to) value, or last if no such
 * element is found.
 * @param arr A sorted array with respect to @param cmp
 */
export function lowerBound<T, T2 = T>(
    arr: Indexable<T>, value: T2, cmp: BinaryPredicate<T, T2>,
    first = 0, count = arr.length - first): number
{
  assert.le(first + count, arr.length);

  let it: number;
  let step = 0;

  while (count > 0) {
    it = first | 0;
    step = (count / 2) | 0;
    it += step;

    if (cmp(arr[it], value)) {
      first = ++it;
      count -= step + 1;
    } else {
      count = step;
    }
  }
  return first;
}

/**
 * Returns the index of the n-th smallest element of list within
 * lo..hi inclusive (i.e. lo <= n <= hi).
 * Time complexity: O(N).
 * @param {Array} arr Input array.
 * @param {Number} n A number of an element.
 * @param {Number} lo Low index.
 * @param {Number} hi High index.
 * @return Returns n-th smallest element.
 */
export function quickselect<T>(
    arr: Indexable<T>, n: number, lo = 0, hi = arr.length - 1): number {
  if (arr.length <= n) { return -1; }

  if (lo === hi) { return lo; }

  while (hi >= lo) {
    const pivotIdx = partition(arr, lo, hi,
        lo + Math.floor(Math.random() * (hi - lo + 1)));

    if (n === pivotIdx) { return pivotIdx; }
    if (n < pivotIdx) {
      hi = pivotIdx - 1;
    } else {
      lo = pivotIdx + 1;
    }
  }
  return -1;
}

/** Lomuto partitioning scheme */
export function partition<T>(
    arr: Indexable<T>, lo: number, hi: number, pivotIdx: number): number {
  const pivot = arr[pivotIdx];
  swap(arr, pivotIdx, hi);

  for (let i = lo; i < hi; i++) {
    if (arr[i] < pivot) {
      swap(arr, i, lo);
      lo++;
    }
  }

  swap(arr, hi, lo);
  return lo;
}

/**
 * Partitions an array, moving elements equal to value to the right
 * of the partition and all other elements to the left, maintaining their
 * order.
 *
 * @param arr Elements
 * @param value Value to partition on
 * @param lo First index
 * @param hi Last index
 * @returns The index of first element of value or -1 if the 
 * input doesn't contain value. 
 */
export function partitionEqual<T>(
    arr: Indexable<T>, value: T, lo: number, hi: number): number {
  assert.bounds(arr, lo);
  assert.bounds(arr, hi);

  while (lo < hi) {
    if (arr[lo] === value) { break; }
    lo++;
  }

  for (let i = lo; i <= hi; i++) {
    if (arr[i] !== value) {
      swap(arr, i, lo);
      lo++;
    }
  }

  return lo > hi ? -1 : lo;
}
