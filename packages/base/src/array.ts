import * as assert from './assert.js';
import * as random from './random.js';

/* A mutable view over an array */
export interface ArrayView<T> {
  readonly length: number;
  [n: number]: T;
}

type BinaryPredicate<T, T2 = T> = (a: T, b: T2) => boolean;

export function lessThan(a: number | string, b: number | string) {
  return a < b;
}

/** Sets all values in an array to the given value */
export function fill<T>(arr: ArrayView<T>, val: T): void {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = val;
  }
}

/**
 * Sets all values in arr in increments of 1.
 * See also: c++ std::iota
 */
export function iota<T extends ArrayView<number>>(arr: T, initial: number): T {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = initial++;
  }
  return arr;
}

/** Copy values from src to dest */
export function copyTo<T>(src: ArrayView<T>, dest: ArrayView<T>): void {
  const n = Math.min(src.length, dest.length);
  for (let i = 0; i < n; i++) {
    dest[i] = src[i];
  }
}

/** Collect a subset of values from src to dest */
export function copySubsetTo<T>(
  src: ArrayView<T>,
  indices: ArrayView<number>,
  dest: ArrayView<T>,
): void {
  const n = Math.min(indices.length, dest.length);
  for (let i = 0; i < n; i++) {
    dest[i] = src[indices[i]];
  }
}

/** Push a subset of src to dest */
export function subsetOf<T, P extends { push(val: T): any }>(
  src: ArrayView<T>,
  indices: ArrayView<number>,
  dest: P,
): P {
  const n = indices.length;
  for (let i = 0; i < n; i++) {
    dest.push(src[indices[i]]);
  }
  return dest;
}

/** Remove all elements from the given indices. */
export function removeAtIndices(arr: ArrayView<any>, indices: ArrayView<number>): number {
  const len = arr.length;
  
  let off = 0;
  for (let i = 0; i < len; i++) {
    const el = arr[i];

    if (off < indices.length && indices[off] === i) {
      // discard this value
      off++;
    } else {
      arr[i - off] = el;
    }
  }

  return len - off;
}

/** Remove elements equal to the given value. Returns the new length of the array. */
export function removeWhere<T>(arr: ArrayView<T>, value: T): number {
  const len = arr.length;
  
  let off = 0;
  for (let i = 0; i < len; i++) {
    const el = arr[i];

    if (el === value) {
      // discard this value
      off++;
    } else {
      arr[i - off] = el;
    }
  }

  return len - off;
}

/**
 * Place the intersection of sorted array as and sorted array bs in as.
 * Returns the size of the intersection.
 */
export function intersection<T>(
  as: ArrayView<T>,
  bs: ArrayView<T>,
  cmp: (a: T, b: T) => number,
): number {
  const aLen = as.length,
    bLen = bs.length;

  let i = 0,
    j = 0,
    k = 0;

  while (i < aLen && j < bLen) {
    const w = cmp(as[i], bs[j]);

    if (w < 0) i++;
    else if (w > 0) j++;
    else {
      as[k++] = as[i++];
      j++;
    }
  }

  return k;
}

/** Merge the two given sorted arrays */
export function union<T>(
  as: ArrayView<T>,
  bs: ArrayView<T>,
  cmp: (a: T, b: T) => number,
  push: (item: T) => any,
): void {
  const aLen = as.length,
    bLen = bs.length;

  let i = 0,
    j = 0;

  while (i < aLen && j < bLen) {
    const w = cmp(as[i], bs[j]);

    let val;

    if (w === 0) {
      val = bs[j++];
      i++;
    } else if (w > 0) {
      val = bs[j++];
    } else {
      val = as[i++];
    }

    push(val);
  }

  // Store remaining elements of first array
  while (i < aLen) push(as[i++]);

  // Store remaining elements of second array
  while (j < bLen) push(bs[j++]);
}

/** Rotate all values between first and last (inclusive) to the left. */
export function rotateLeft(arr: ArrayView<any>, first: number, last: number) {
  assert.lte(first, last);
  assert.bounds(arr, first);
  assert.bounds(arr, last);

  const rotatedElement = arr[last];

  while (last !== first) arr[last] = arr[--last];

  arr[first] = rotatedElement;
}

/** Rotate all values between first and last (inclusive) to the right. */
export function rotateRight(arr: ArrayView<any>, first: number, last: number) {
  assert.lte(first, last);
  assert.bounds(arr, first);
  assert.bounds(arr, last);

  const rotatedElement = arr[first];

  while (first !== last) arr[first] = arr[++first];

  arr[last] = rotatedElement;
}

/** Swap the elements in the two given indices */
export function swap<T>(arr: ArrayView<T>, adx: number, bdx: number) {
  assert.is(adx >= 0 && adx < arr.length && bdx >= 0 && bdx < arr.length);

  const tmp = arr[adx];
  arr[adx] = arr[bdx];
  arr[bdx] = tmp;
}

/** Sort an array of numbers (ascending) */
export function sort<T extends ArrayView<number>>(xs: T): T {
  return Array.prototype.sort.call(xs, (a, b) => a - b) as any;
}

/**
 * Returns the index of the first element in the range that
 * is not less than (i.e. greater or equal to) value, or last if no such
 * element is found.
 * @param arr A sorted array with respect to @param cmp
 */
export function lowerBound<T, T2 = T>(
  arr: ArrayView<T>,
  value: T2,
  cmp: BinaryPredicate<T, T2>,
  first = 0,
  count = arr.length - first,
): number {
  assert.le(first + count, arr.length);
  first |= 0;

  let step = 0;

  while (count > 0) {
    let it = first;

    step = count >>> 1;
    it += step;

    if (cmp(arr[it], value)) {
      first = it + 1;
      count -= step + 1;
    } else {
      count = step;
    }
  }

  return first;
}

/**
 * Returns the index of the n-th smallest element of an unsorted list within
 * lo..hi inclusive (i.e. lo <= n <= hi).
 * Time complexity: O(N).
 *
 * @param {Array} arr Input array.
 * @param {Number} n A number of an element.
 * @param {Number} lo Low index.
 * @param {Number} hi High index.
 * @return Returns n-th smallest element.
 */
export function quickselect<T>(arr: ArrayView<T>, n: number, lo = 0, hi = arr.length - 1): number {
  if (arr.length <= n) return -1;
  if (lo === hi) return lo;

  while (hi >= lo) {
    const pivotIdx = partition(arr, lo, hi, lo + Math.floor(0.5 * (hi - lo + 1)));

    if (n === pivotIdx) return pivotIdx;

    if (n < pivotIdx) {
      hi = pivotIdx - 1;
    } else {
      lo = pivotIdx + 1;
    }
  }

  return -1;
}

/** Lomuto partitioning scheme */
export function partition<T>(arr: ArrayView<T>, lo: number, hi: number, pivotIdx: number): number {
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
export function partitionEqual<T>(arr: ArrayView<T>, value: T, lo: number, hi: number): number {
  assert.bounds(arr, lo);
  assert.bounds(arr, hi);

  while (lo < hi) {
    if (arr[lo] === value) break;
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

/** Random shuffle */
export function shuffle<T>(arr: ArrayView<T>, rng: random.Generator) {
  const dist = random.uniform(0, 1, rng);
  let currentIdx = arr.length;

  while (currentIdx !== 0) {
    const randomIdx = Math.floor(dist() * currentIdx);
    currentIdx--;

    // And swap it with the current element.
    const a = arr[currentIdx];
    arr[currentIdx] = arr[randomIdx];
    arr[randomIdx] = a;
  }

  return arr;
}
