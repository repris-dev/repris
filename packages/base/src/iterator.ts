import { Indexable } from './array.js';
import { assert } from './index.js';

export const empty = (function* (): IterableIterator<any> {})();

export function* single<T>(value: T): IterableIterator<T> {
  yield value;
}

export function returnWith<T>(value: T): Iterator<T, T> {
  return { next: () => ({ done: true, value }) };
}

export function* cartesianProduct<T>(
  elems: Indexable<Indexable<T>>
): IterableIterator<Indexable<T>> {
  let i = 0;
  while (true) {
    const result = [] as T[];

    let j = i;
    for (let k = 0; k < elems.length; k++) {
      const e = elems[k];

      result.push(e[j % e.length]);
      j = (j / e.length) | 0;
    }
    if (j > 0) {
      return;
    }

    yield result;
    i++;
  }
}

export function collect<T>(iter: Iterator<T>, dest: T[] = []): T[] {
  for (let it = iter.next(); !it.done; it = iter.next()) {
    dest.push(it.value);
  }
  return dest;
}

/**
 * Transform an iterator in to one which has a return value equal to the
 * last value in the sequence. If the given iterator is empty the resulting
 * iterator returns a default value;
 */
export function returnLast<T>(iter: Iterator<T, any>, defaultValue: T): Iterator<T, T> {
  const last = { done: true, value: defaultValue };

  const next = () => {
    const it = iter.next();
    if (!it.done) {
      last.value = it.value;
      return it;
    }
    return last;
  };

  return { next };
}

/**
 * Returns an iterable yielding all the values from the given iterables in
 * order. If any iterables are infinite then none of the values from
 * subsequent iterables will be read.
 *
 * @example
 *
 *   toArray(concat([range(0, 1), range(4, 5)]))
 *   // [0, 1, 4, 5]
 */
export function* concat<T>(its: Array<Iterable<T>>): Iterable<T> {
  for (const it of its) {
    yield* it;
  }
}

/**
 * Take the first n elements of it
 */
export function* take<T>(n: number, it: Iterable<T>): Iterable<T> {
  for (const x of it) {
    if (n-- > 0) {
      yield x;
    } else {
      break;
    }
  }
}

/**
 * Create a generator
 */
export function* gen<T>(fn: () => T): Iterable<T> {
  while (true) {
    yield fn();
  }
}

/**
 * Create a range of n numbers from start
 */
export function* range(from: number, n: number): IterableIterator<number> {
  while (n-- > 0) {
    yield from++;
  }
}

/**
 * Iterate a subspan of values
 */
export function* subSpan<T>(
  xs: Indexable<T>,
  fromIdx: number,
  n = xs.length - fromIdx
): Iterable<T> {
  if (n <= 0) return;

  assert.bounds(xs, fromIdx);
  assert.bounds(xs, fromIdx + (n - 1));

  while (n-- > 0) {
    yield xs[fromIdx++];
  }
}

export function* map<A, B>(xs: Iterable<A>, fn: (x: A, idx?: number) => B): IterableIterator<B> {
  let i = 0;

  for (const x of xs) {
    yield fn(x, i++);
  }
}

export function* filter<T>(
  xs: Iterable<T>,
  fn: (x: T, idx?: number) => boolean
): IterableIterator<T> {
  let i = 0;

  for (const x of xs) {
    if (fn(x, i++)) yield x;
  }
}

export function* pairs<T>(xs: Iterable<T>): Iterable<[T, T]> {
  const it = xs[Symbol.iterator]();
  const pair = [void 0, void 0] as unknown as [T, T];

  while (true) {
    const a = it.next();
    const b = it.next();

    if (a.done === false && b.done === false) {
      pair[0] = a.value;
      pair[1] = b.value;

      yield pair;
    } else {
      break;
    }
  }
}

export function reduce<T, A>(xs: Iterable<T>, fn: (acc: A, x: T) => A, a: A) {
  for (const x of xs) {
    a = fn(a, x);
  }

  return a;
}

export function count<T>(xs: Iterable<T>): number {
  let n = 0;

  for (const _ of xs) {
    n++;
  }

  return n;
}

export function* outerJoin<T>(
  as: Iterable<T>,
  bs: Iterable<T>,
  keyOf: (t: T) => any
): Iterable<[T | undefined, T | undefined]> {
  const keys = new Map<any, T>;
  for (const b of bs) {
    keys.set(keyOf(b), b);
  }

  for (const a of as) {
    const aKey = keyOf(a);
    const bVal = keys.get(aKey);
    keys.delete(aKey);

    yield [a, bVal];
  };

  for (const b of keys.values()) {
    yield [undefined, b];
  }
}
