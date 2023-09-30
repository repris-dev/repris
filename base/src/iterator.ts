import { Indexable } from './array.js';

export const empty = (function* (): IterableIterator<any> { })();

export function* single<T>(value: T): IterableIterator<T> {
  yield value;
}

export function returnWith<T>(value: T): Iterator<T, T> {
  return { next: () => ({ done: true, value }) };
}

export function* cartesianProduct<T>(elems: Indexable<Indexable<T>>): IterableIterator<Indexable<T>> {
  let i = 0;
  while (true) {
    const result = [] as T[];

    let j = i;
    for (let k = 0; k < elems.length; k++) {
      const e = elems[k];

      result.push(e[j % e.length]);
      j = (j / e.length) | 0;
    }
    if (j > 0) { return; }

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
  }

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
