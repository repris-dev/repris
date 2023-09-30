import { json, assignDeep, iterator, uuid, typeid, random, assert, Status } from '@repris/base';

import * as ann from './annotators.js';
import * as wt from './wireTypes.js';
import * as samples from './samples.js';
import * as conflations from './conflations.js';

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

  totalRuns(): number;

  addRun(conflation: conflations.ConflationResult<S>): DefaultFixture;
}

export class DefaultFixture implements AggregatedFixture<samples.Duration> {
  static readonly [typeid] = '@fixture:duration' as typeid;

  static is(x?: any): x is DefaultFixture {
    return x !== void 0 && x[typeid] === DefaultFixture[typeid];
  }

  static fromJSON(fixture: wt.Fixture): Status<DefaultFixture> {
    if (fixture['@type'] !== DefaultFixture[typeid]) {
      return Status.err(`Unexpected type`);
    }

    const resultSamples = [] as samples.Duration[];
    const sampleMap = new Map<uuid, samples.Duration>();

    for (let ws of fixture.samples) {
      const s = samples.Duration.fromJson(ws.data);
      if (!Status.isErr(s)) {
        const sample = Status.get(s);
        resultSamples.push(sample);
        sampleMap.set(sample[uuid], sample);
      } else {
        return Status.err(
          `Failed to load sample of type: ${ws.data['@type']}\nReason: ${s[1].message}`
        );
      }
    }

    let c: conflations.DurationResult | undefined;

    if (fixture.conflation) {
      const cTmp = conflations.DurationResult.fromJson(fixture.conflation, sampleMap);

      if (Status.isErr(cTmp)) {
        return Status.err(`Failed to load conflation: ${cTmp[1].message}`);
      }

      c = cTmp[0];
    }

    const result = new DefaultFixture(fixture.name, resultSamples, c, fixture.totalRuns);
    const annotations = result.annotations();

    for (const [key, bag] of Object.entries(fixture.annotations ?? {})) {
      annotations.set(key as uuid, bag);
    }

    result._uuid = fixture['@uuid'];

    return Status.value(result);
  }

  static empty(name: wt.FixtureName): DefaultFixture {
    return new DefaultFixture(name, []);
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
  private _conflation?: conflations.ConflationResult<samples.Duration>;
  private _annotations = new Map<uuid, wt.AnnotationBag>();
  private _totalruns: number;

  private constructor(
    public readonly name: wt.FixtureName,
    samples: Iterable<samples.Duration>,
    conflation?: conflations.ConflationResult<samples.Duration>,
    totalRuns = 0
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

    assert.gte(totalRuns, 0);
    this._totalruns = totalRuns;
  }

  totalRuns(): number {
    return this._totalruns;
  }

  samples(): Iterable<samples.Duration> {
    return this._samples;
  }

  conflation(): conflations.ConflationResult<samples.Duration> | undefined {
    return this._conflation;
  }

  annotations(): Map<uuid, wt.AnnotationBag> {
    return this._annotations;
  }

  addRun(conflation: conflations.ConflationResult<samples.Duration>): DefaultFixture {
    // Create a new fixture
    const samples: samples.Duration[] = [];
    for (const { status, sample } of conflation.stat()) {
      if (status !== 'rejected') {
        samples.push(sample);
      }
    }

    const newFixt = new DefaultFixture(this.name, samples, conflation, this.totalRuns() + 1);
    newFixt._uuid = this[uuid];

    // copy sample annotations
    // Note: the conflation annotation isn't copied since
    // a fixture can only contain one conflation at a time.
    const src = this.annotations();
    const dst = newFixt.annotations();

    for (const s of samples) {
      if (src.has(s[uuid])) {
        dst.set(s[uuid], src.get(s[uuid])!);
      }
    }

    // copy the self-annotation (if one exists)
    if (src.has(this[uuid])) {
      dst.set(this[uuid], src.get(this[uuid])!);
    }

    return newFixt;
  }

  toJson(): wt.Fixture {
    return {
      '@type': this[typeid],
      '@uuid': this[uuid],
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
      totalRuns: this._totalruns,
    };
  }
}

export const annotations = {
  /**
   * A summary of the cache status. Legend:
   *
   *   <active subset>/<total samples> (<Kruskal-Wallis effect-size>)
   *
   */
  summaryText: 'fixture:summaryText' as typeid,

  stable: 'fixture:stable' as typeid,
} as const;

ann.register('@fixture:annotator' as typeid, {
  annotations() {
    return Object.values(annotations);
  },

  annotate(fixt: DefaultFixture, _request: Map<typeid, {}>): Status<ann.AnnotationBag | undefined> {
    if (!DefaultFixture.is(fixt)) return Status.value(void 0);

    let summary;

    const confl = fixt.conflation();
    if (confl) {
      let outlier = 0,
        consistent = 0;

      confl.stat().forEach(x => {
        switch (x.status) {
          case 'consistent':
            consistent++;
            break;
          case 'outlier':
            outlier++;
            break;
        }
      });

      // <effect size> (<active samples>/<total runs>)
      const tot = consistent + outlier;
      summary = `${tot > 1 ? confl.effectSize().toFixed(2) : '-'} (${tot}/${fixt.totalRuns()})`;
    } else {
      // - (-/<total runs>)
      summary = `- (-/${fixt.totalRuns()})`;
    }

    const bag = ann.DefaultBag.from([
      [annotations.summaryText, summary],
      [annotations.stable, confl?.ready() ?? false],
    ]);

    return Status.value(bag);
  },
});
