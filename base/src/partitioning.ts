import * as assert from './assert.js';
import { fillAscending, Indexable } from './array.js';

/** Encodes a partitioning as a set of vertex tours */
class DisjointSet<T extends number> {
  readonly size: number;

  private constructor(
    private tourStart: Indexable<T>,
    private tours: Indexable<T>,
    private nTours: number
  ) {
    this.size = tours.length;
  }

  countGroups(): number {
    return this.nTours;
  }

  /** @returns the group representative of the given item */
  get(id: T): T {
    return this.tourStart[id];
  }

  *iterateGroups(): Iterator<T> {
    const tourStart = this.tourStart;

    let i = 0 as T;
    let n = this.nTours;

    while (n > 0) {
      if (tourStart[i] === i) {
        // A tour starts here
        yield i;
        n--;
      }
      i++;
    }

    assert.is(i <= tourStart.length);
  }

  *iterateGroup(id: T): Iterator<T> {
    const tours = this.tours;

    id = this.tourStart[id];
    yield id;

    while (tours[id] > id) {
      id = tours[id];
      yield id;
    }
  }

  groupSize(id: T): number {
    id = this.tourStart[id as number];

    let n = 1;
    while (id < (id = this.tours[id as number])) {
      n++;
    }

    return n;
  }

  static build<T extends number>(parents: Indexable<T>): DisjointSet<T> {
    const n = parents.length;
    // ordered vertex tours that end at the last element in the group
    const tours = new Int32Array(n) as any as Indexable<T>;
    // current end of the vertex tour; avoids O(N^2) when constructing tours
    const tourEnd = new Int32Array(n);
    // number of groups
    let nTours = 0;

    for (let i = 0 as T; i < n; i++) {
      const lowerBound = find(parents, i, true);

      let tour: number;
      if (lowerBound === i) {
        nTours++;
        tour = i;
      } else {
        tour = tourEnd[lowerBound];
      }

      // append this item to the end of the tour
      tours[tour] = i;
      tourEnd[lowerBound] = i;
    }

    return new DisjointSet<T>(parents, tours, nTours);
  }
}

/** Union two sets */
export function union<T extends number>(parents: Indexable<T>, a: T, b: T) {
  const idx1 = find(parents, a, true);
  const idx2 = find(parents, b, true);

  if (idx1 > idx2) {
    parents[idx1] = idx2;
  } else if (idx1 < idx2) {
    parents[idx2] = idx1;
  }
}

/** Find set representative, with optional tree compression */
export function find<T extends number>(parents: Indexable<T>, item: T, compress: boolean): T {
  assert.inRange(item, 0, parents.length);

  // representative
  let rep = item;

  while (rep >= 0 && parents[rep] !== rep) {
    rep = parents[rep];
  }

  if (compress) {
    while (item !== rep) {
      const tmp = item;
      // parent of the current item
      item = parents[item];
      // rewire to the representative
      parents[tmp] = rep;
    }
  }

  return rep;
}

export function from<T extends number>(pairs: Iterable<[T, T]>, V: number): DisjointSet<T> {
  const parents = new Int32Array(V) as any as Indexable<T>;
  fillAscending(parents, 0);

  for (const [from, to] of pairs) {
    if (from >= 0 && to >= 0) union(parents, from, to);
  }

  return DisjointSet.build(parents);
}
