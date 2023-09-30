import * as fs from 'fs';
import { debug } from 'util';

import HasteMap from 'jest-haste-map';
import type { Config } from '@jest/types';
import { samples, wiretypes as wt } from '@sampleci/samplers';
import { json, typeid, Status } from '@sampleci/base';

const dbg = debug('sci:cache');

/**
 * A file storing the results of one or more runs of a test suite
 */
type ReportCacheWT = {
  /** The suite which produced each run in this cache */
  suiteFilePath: string;
  /**  */
  fixtures: wt.Fixture[];
};

/**
 * A test run produces a report. The report contains a number of fixtures,
 * and each fixture contains a sample and its annotations.
 *
 * When multiple reports are combined together it produces a set of aggregated
 * fixtures which is summarized by a conflation.
 */
export type AggregatedFixture<T extends samples.Sample<any>> = {
  name: wt.FixtureName;

  samples: {
    sample: T;
    annotations?: Record<typeid, json.Value>;
  }[];

  conflation?: wt.SampleConflation;
};

export class SampleCacheManager {
  fixtures?: Map<`${string}: ${number}`, wt.Fixture>;
  cachePath: string;

  constructor(public config: Config.ProjectConfig, public filePath: string) {
    this.cachePath = this.getCachePath();
  }

  updateFixture(title: string[], index: number, fixture: AggregatedFixture<samples.Duration>) {
    if (!this.fixtures) this.load();

    this.fixtures!.set(`${JSON.stringify(title)}: ${index}`, {
      name: fixture.name,
      samples: fixture.samples.map(({ sample, annotations }) => ({
        data: sample.toJson(),
        annotations,
      })),
      conflation: fixture.conflation,
    });
  }

  /** @returns  */
  getFixture(title: string[], nth: number): AggregatedFixture<samples.Duration> {
    if (!this.fixtures) this.load();

    const fixture = this.fixtures!.get(`${JSON.stringify(title)}: ${nth}`);

    if (fixture) {
      const resultSamples = [] as AggregatedFixture<samples.Duration>['samples'];

      for (let ws of fixture.samples) {
        const s = samples.Duration.fromJson(ws.data);
        if (!Status.isErr(s)) {
          resultSamples.push({ sample: Status.get(s), annotations: ws.annotations });
        } else {
          dbg('Failed to load sample of type: "%s"', ws.data['@type']);
        }
      }

      return {
        name: fixture.name,
        samples: resultSamples,
        conflation: fixture.conflation,
      };
    }

    return {
      name: {
        title,
        nth,
      },
      samples: [],
    };
  }

  private getCachePath() {
    const config = this.config;
    const HasteMapClass = HasteMap.default.getStatic(config);

    return HasteMapClass.getCacheFilePath(
      config.cacheDirectory,
      `sample-cache-${config.id}`,
      this.filePath
    );
  }

  private indexFixtures(fixtures: wt.Fixture[]) {
    for (let i = 0; i < fixtures.length; i++) {
      const fixture = fixtures[i];
      const key = JSON.stringify(fixture.name.title);
      const nth = fixture.name.nth;

      this.fixtures!.set(`${key}: ${nth}`, fixture);
    }
  }

  save() {
    if (this.fixtures) {
      const cache: ReportCacheWT = {
        suiteFilePath: this.filePath,
        fixtures: Array.from(this.fixtures.values()),
      };

      fs.writeFileSync(this.cachePath, JSON.stringify(cache));
    }
  }

  private load() {
    this.fixtures = new Map();

    if (fs.existsSync(this.cachePath)) {
      let cache: ReportCacheWT;

      try {
        cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf8')) as ReportCacheWT;
      } catch (e) {
        throw new Error('Failed to load sample cache file: ' + (e as {}).toString());
      }

      // simple validation
      if (cache.suiteFilePath !== this.filePath) {
        throw new Error(
          `Invalid cache file, expected "${this.cachePath}", got "${cache.suiteFilePath}".`
        );
      }

      this.indexFixtures(cache.fixtures);
    }
  }
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
