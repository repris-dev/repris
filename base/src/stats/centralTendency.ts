import { assert } from '../index.js';
import { Indexable } from '../util.js';

export function mean(xs: Indexable<number>) {
  const norm = 1 / xs.length;

  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += norm * xs[i];
  }

  return sum;
}

export function geometricMean(xs: Indexable<number>) {
  const norm = 1 / xs.length;

  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    assert.gte(xs[i], 0);
    sum += norm * xs[i];
  }

  return Math.exp(sum);
}

export function harmonicMean(xs: Indexable<number>) {
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    assert.gte(xs[i], Number.EPSILON);
    sum += 1 / xs[i];
  }

  return xs.length / sum;
}
