import { json, typeid, Status, assignDeep, iterator } from '@repris/base';
import * as wt from './wireTypes.js';
import * as samples from './samples.js';

/**
 * A test run produces a report. The report contains a number of fixtures,
 * and each fixture contains a sample and its annotations.
 *
 * When multiple reports are combined together it produces a set of aggregated
 * fixtures which can be summarized by a conflation.
 */
export type AggregatedFixture<T extends samples.Sample<any>> = {
  name: wt.FixtureName;

  samples: {
    sample: T;
    annotations?: Record<typeid, json.Value>;
  }[];

  /** An analysis of the samples together */
  conflation?: wt.Conflation;
};

export const enum FixtureState {
  Unknown = 0,
  Stored = 1,
  Tombstoned = 2
};

type FixtureKey = `${string}: ${number}`;

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

  allFixtures(): Iterable<AggregatedFixture<samples.Duration>> {
    return iterator.map(this.fixtures.values(), (f) => this.fromJsonFixture(f));
  }

  updateFixture(title: string[], nth: number, fixture: AggregatedFixture<samples.Duration>) {
    const key = cacheKey(title, nth);

    this.fixtures.set(key, {
      name: assignDeep({} as wt.FixtureName, fixture.name),
      samples: fixture.samples.map(({ sample, annotations }) => ({
        data: sample.toJson(),
        annotations: annotations ? assignDeep({}, annotations) : undefined,
      })),
      conflation: fixture.conflation
        ? assignDeep({} as wt.Conflation, fixture.conflation)
        : undefined,
    });
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
        resultSamples.push({ sample: Status.get(s), annotations: ws.annotations });
      } else {
        throw new Error(`Failed to load sample of type: ${ws.data['@type']}`);
      }
    }

    return {
      name: fixture.name,
      samples: resultSamples,
      conflation: fixture.conflation,
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

function cacheKey(title: string[], nth: number): FixtureKey {
  return `${JSON.stringify(title)}: ${nth}`;
}

/** A set which counts the number of times an item has been added */
export class RecordCounter<T> {
  index = new Map<T, number>();

  increment(item: T): number {
    const index = this.index;
    const x = (index.get(item) ?? 0) + 1;

    index.set(item, x);
    return x;
  }

  get(item: T): number {
    return this.index.get(item) ?? 0;
  }
}
