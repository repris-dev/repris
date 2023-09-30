import { json, Status, iterator } from '@repris/base';
import * as wt from './wireTypes.js';
import * as samples from './samples.js';
import * as f from './fixture.js';

export const enum FixtureState {
  Unknown = 0,
  Stored = 1,
  Tombstoned = 2,
}

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

  allFixtures(): IterableIterator<f.AggregatedFixture<samples.Duration>> {
    return iterator.map(this.fixtures.values(), f => this.fromJsonFixture(f));
  }

  updateFixture(fixture: f.AggregatedFixture<samples.Duration>) {
    const { title, nth } = fixture.name;
    const key = cacheKey(title, nth);

    this.fixtures.set(key, fixture.toJson());
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

  /**
   * @returns The aggregated fixture for the given title, or an empty fixture if
   * the name doesn't exist in the snapshot.
   */
  getFixture(title: string[], nth: number): f.AggregatedFixture<samples.Duration> | undefined {
    const fixture = this.fixtures.get(cacheKey(title, nth));
    if (!fixture) {
      return;
    }

    return this.fromJsonFixture(fixture);
  }

  private fromJsonFixture(fixture: wt.Fixture): f.AggregatedFixture<samples.Duration> {
    const fx = f.DefaultFixture.fromJSON(fixture)
    if (Status.isErr(fx)) {
      throw new Error(Status.get(fx));
    }

    return Status.get(fx);
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

/** Join the fixtures across two snapshots */
export function joinSnapshotFixtures(a: Snapshot, b: Snapshot) {
  return iterator.outerJoin(a.allFixtures(), b.allFixtures(), f =>
    cacheKey(f.name.title, f.name.nth)
  );
}
