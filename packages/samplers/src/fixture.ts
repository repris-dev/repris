import { json, assignDeep, iterator, uuid, typeid, random } from '@repris/base';

import * as wt from './wireTypes.js';
import * as samples from './samples.js';
import { conflations } from './index.js';

/**
 * A test run produces a report. The report contains a number of fixtures,
 * and each fixture contains a sample and its annotations.
 *
 * When multiple reports are combined together it produces a set of aggregated
 * fixtures which can be summarized by a conflation.
 */
export interface AggregatedFixture<S extends samples.Sample<any>>
  extends json.Serializable<wt.Fixture> {
  /** The kind of conflation result */
  readonly [typeid]: typeid;

  readonly [uuid]: uuid;

  readonly name: wt.FixtureName;

  samples(): Iterable<S>;

  conflation(): conflations.ConflationResult<S> | undefined;

  annotations(): ReadonlyMap<uuid, wt.AnnotationBag>;
}

export class DefaultFixture implements AggregatedFixture<samples.Duration> {
  static [typeid] = '@fixture:duration' as typeid;

  static is(x?: any): x is DefaultFixture {
    return x !== void 0 && x[typeid] === DefaultFixture[typeid];
  }

  static fromJSON() {
    // TODO..
  }

  readonly [typeid] = DefaultFixture[typeid];

  get [uuid]() {
    if (!this._uuid) {
      this._uuid = random.newUuid();
    }
    return this._uuid;
  }

  private _uuid!: uuid;
  private _samples: samples.Duration[];
  private _conflation?: conflations.DurationResult;
  private _annotations = new Map<uuid, wt.AnnotationBag>();

  constructor(
    public readonly name: wt.FixtureName,
    samples: Iterable<samples.Duration>,
    conflation?: conflations.DurationResult
  ) {
    this._samples = iterator.collect(samples[Symbol.iterator]());
    this._conflation = conflation;

    if (this._conflation) {
      const index = new Set(iterator.map(this._samples, s => s[uuid]));
      for (const { sample, status } of this._conflation.stat()) {
        if (status !== 'rejected' && !index.has(sample[uuid])) {
          throw new Error(
            `Fixture failed validation. The fixture doesn't contain\n` +
              `sample ${sample[uuid]} (status: ${status}) which the conflation references.`
          );
        }
      }
    }
  }

  samples(): Iterable<samples.Duration> {
    return this._samples;
  }

  conflation(): conflations.DurationResult | undefined {
    return this._conflation;
  }

  annotations(): Map<uuid, wt.AnnotationBag> {
    return this._annotations;
  }

  toJson(): wt.Fixture {
    return {
      name: assignDeep({} as wt.FixtureName, this.name),
      samples: iterator.collect(
        iterator.map(this.samples(), sample => ({
          data: sample.toJson(),
        }))
      ),
      conflation: this.conflation()?.toJson(),
      annotations: iterator.reduce(
        this.annotations().entries(),
        (acc, [uuid, bag]) => ((acc[uuid as string] = bag), acc),
        {} as Record<string, wt.AnnotationBag>
      ),
      totalRuns: 0,
    };
  }
}
