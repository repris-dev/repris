import { json, Status, assignDeep, iterator, uuid } from '@repris/base';
import * as wt from './wireTypes.js';
import * as samples from './samples.js';

/**
 * A test run produces a report. The report contains a number of fixtures,
 * and each fixture contains a sample and its annotations.
 *
 * When multiple reports are combined together it produces a set of aggregated
 * fixtures which can be summarized by a conflation.
 */
export type AggregatedFixture<S extends samples.Sample<any>> = {
  name: wt.FixtureName;

  samples: {
    sample: S;
    annotations: wt.AnnotationBag;
  }[];

  /** An analysis of the samples together */
  conflation?: {
    result: wt.ConflationResult;
    annotations: wt.AnnotationBag;
  };
};

export const enum FixtureState {
  Unknown = 0,
  Stored = 1,
  Tombstoned = 2
};

type FixtureKey = `${string}: ${number}`;

function cacheKey(title: string[], nth: number): FixtureKey {
  return `${JSON.stringify(title)}: ${nth}`;
}

export class Snapshot implements json.Serializable<wt.Snapshot> {
  private fixtures: Map<FixtureKey, wt.Fixture> = new Map();
  private tombstones: Map<FixtureKey, wt.FixtureName> = new Map();

  constructor() {}

  static fromJson(snap: wt.Snapshot): Snapshot {
    const s = new Snapshot();
    s.indexFixtures(snap.fixtures, snap.tombstones);
    return s;
  }

  isEmpty() {
    return this.fixtures.size === 0 && this.tombstones.size === 0;
  }

  fixtureState(title: string[], nth: number) {
    const key = cacheKey(title, nth);
    return this.fixtures.has(key)
      ? FixtureState.Stored
      : this.tombstones.has(key)
      ? FixtureState.Tombstoned
      : FixtureState.Unknown;
  }

  allFixtures(): IterableIterator<AggregatedFixture<samples.Duration>> {
    return iterator.map(this.fixtures.values(), (f) => this.fromJsonFixture(f));
  }

  updateFixture(title: string[], nth: number, fixture: AggregatedFixture<samples.Duration>) {
    const key = cacheKey(title, nth);
    const annotationIndex = {} as Record<string, wt.AnnotationBag>;

    fixture.samples.forEach(f => {
      if (f.annotations) annotationIndex[f.sample[uuid]] = f.annotations;
    });

    if (fixture.conflation) {
      annotationIndex[fixture.conflation.result['@uuid']] = assignDeep({}, fixture.conflation.annotations);
    }

    const s: wt.Fixture = {
      name: assignDeep({} as wt.FixtureName, fixture.name),
      samples: fixture.samples.map(({ sample }) => ({
        data: sample.toJson()
      })),
      conflation: fixture.conflation
        ? assignDeep({} as wt.ConflationResult, fixture.conflation.result)
        : undefined,
      annotations: annotationIndex
    };

    this.fixtures.set(key, s);
  }

  allTombstones(): Iterable<wt.FixtureName> {
    return this.tombstones.values();
  }

  /** @returns true if the given title was found in the cache and tombstoned */
  tombstone(title: string[], nth: number): boolean {
    const key = cacheKey(title, nth);
    const fixture = this.fixtures.get(key);

    if (fixture) {
      this.tombstones!.set(key, fixture.name);
      return true;
    }

    // fixture not found in the cache
    return false;
  }

  /** @returns  */
  getOrCreateFixture(title: string[], nth: number): AggregatedFixture<samples.Duration> {
    const fixture = this.fixtures.get(cacheKey(title, nth));
    if (!fixture) {
      return {
        name: { title, nth },
        samples: [],
      };
    }

    return this.fromJsonFixture(fixture);
  }

  private fromJsonFixture(fixture: wt.Fixture): AggregatedFixture<samples.Duration> {
    const resultSamples = [] as AggregatedFixture<samples.Duration>['samples'];

    for (let ws of fixture.samples) {
      const s = samples.Duration.fromJson(ws.data);
      if (!Status.isErr(s)) {
        const sample = Status.get(s);
        const annotations = fixture.annotations?.[sample[uuid]] ?? {};

        resultSamples.push({ sample, annotations });
      } else {
        throw new Error(`Failed to load sample of type: ${ws.data['@type']}`);
      }
    }

    const conflation = fixture.conflation ?
      { result: fixture.conflation, annotations: fixture.annotations?.[fixture.conflation['@uuid']] ?? {} }
      : void 0;

    return {
      name: fixture.name,
      samples: resultSamples,
      conflation
    };
  }

  private indexFixtures(fixtures: wt.Fixture[], tombstones: wt.FixtureName[] = []) {
    // fixtures
    for (let i = 0; i < fixtures.length; i++) {
      const fixture = fixtures[i];
      const nth = fixture.name.nth;

      this.fixtures.set(cacheKey(fixture.name.title, nth), fixture);
    }

    // tombstones
    for (let i = 0; i < tombstones.length; i++) {
      const name = tombstones[i];
      this.tombstones!.set(cacheKey(name.title, name.nth), name);
    }
  }

  toJson(): wt.Snapshot {
    const fixtures = [] as wt.Fixture[];

    // dont save samples which were tombstoned
    for (const [key, fixture] of this.fixtures.entries()) {
      if (!this.tombstones?.has(key)) {
        fixtures.push(fixture);
      }
    }

    return {
      tombstones: Array.from(this.tombstones!.values()),
      fixtures,
    };
  }
}

export function joinSnapshotFixtures(a: Snapshot, b: Snapshot) {
  return iterator.outerJoin(a.allFixtures(), b.allFixtures(), f => cacheKey(f.name.title, f.name.nth))
}

