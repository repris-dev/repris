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
