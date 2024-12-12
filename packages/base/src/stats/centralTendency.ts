import { assert } from '../index.js';
import type { ArrayView } from '../array.js';
import { sum } from './util.js';

export function mean(xs: ArrayView<number>) {
  return xs.length > 0 ? sum(xs) / xs.length : 0;
}

export function geometricMean(xs: ArrayView<number>) {
  if (xs.length === 0) return 0;

  const norm = 1 / xs.length;

  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    assert.gte(xs[i], 0);
    sum += norm * xs[i];
  }

  return Math.exp(sum);
}

export function harmonicMean(xs: ArrayView<number>) {
  if (xs.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    assert.gte(xs[i], Number.EPSILON);
    sum += 1 / xs[i];
  }

  return xs.length / sum;
}
