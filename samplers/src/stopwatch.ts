import { Status, isPromise, typeid, assert, array, timer, iterator, quantity as q } from '@repris/base';
import * as types from './types.js';
import * as samples from './samples.js';
import * as wt from './wireTypes.js';

/** Type of function which can be sampled by the stopwatch */
export type SamplerFn<Args extends any[]> = types.SamplerFn<timer.HrTime, StopwatchState, Args>

/** options supported by the sampler */
export type Options = typeof defaultSamplerOptions;

/** State available to the function under test */
export interface StopwatchState extends types.SamplerState<timer.HrTime>
{
  keepRunning(): boolean;

  range(i?: number): number;
  ranges(): number[];
}

const defaultSamplerOptions = {
  /* Time to spend collecting the sample (ms) */
  'duration.min': 500,
  'duration.max': 7_500,

  /* The range of observations to take for the sample */
  'sampleSize.min': 10,
  'sampleSize.max': 1000,

  /**
   * The maximum size of the returned sample, using reservoir sampling.
   * A value < 0 disables reservoir sampling and the returned sample
   * will contain all observations.
   * 
   * See: https://en.wikipedia.org/wiki/Reservoir_sampling
   */
  'reservoirSample.capacity': 500,

  /** warmup options */
  'warmup.duration.min': 100,
  'warmup.duration.max': 1_000,
  'warmup.sampleSize.min': 10,
}

const enum Phase {
  Ready = 0,
  Warmup = 1,
  Sampling = 2
}

const SECOND = timer.HrTime.from(q.create('second', 1));

/**
 * Implementation of a micro-benchmarking sampler
 */
export class Sampler<Args extends any[] = []> implements types.Sampler<number> {
  static readonly [typeid] = '@sampler:stopwatch' as typeid;
  
  readonly opts: Options;
  readonly state: StopwatchState;
  readonly clock: timer.Clock;
  readonly result: samples.MutableSample<timer.HrTime, number>;
  readonly durationBounds: {
    main: [min: timer.HrTime, max: timer.HrTime],
    warmup: [min: timer.HrTime, max: timer.HrTime]
  }

  phase = Phase.Ready;
  totalElapsed = 0n;
  timeSource: timer.TimeSource;

  constructor (
    private readonly fn: SamplerFn<Args>,
    private parameter: number[],
    opts?: Partial<Options>,
    timeSource = timer.create(),
    private readonly gc: () => void = (() => {})
  )
  {
    this.clock = timer.createClock(timeSource, this.onObservation.bind(this));
    this.opts = Object.assign({}, defaultSamplerOptions, opts);
    this.state = new DefaultState(this.clock, parameter);
    this.timeSource = timeSource.clone();

    this.result = new samples.Duration(
      { maxCapacity: this.opts['reservoirSample.capacity'] < 0 ? this.opts['sampleSize.max'] : this.opts['reservoirSample.capacity'] }
    );

    this.durationBounds = {
      main: [
        timer.HrTime.from(q.create('millisecond', this.opts['duration.min'])),
        timer.HrTime.from(q.create('millisecond', this.opts['duration.max'])),
      ],
      warmup: [
        timer.HrTime.from(q.create('millisecond', this.opts['warmup.duration.min'])),
        timer.HrTime.from(q.create('millisecond', this.opts['warmup.duration.max'])),
      ]
    }
  }

  sample(): samples.Sample<number> {
    return this.result;
  }

  /** Start capturing samples */
  run(...args: Args): Status | Promise<Status> {
    if (this.phase !== Phase.Ready) { throw new Error('The stopwatch is already running'); }

    // TODO: measure the overhead of .apply()
    const applyParams = [this.state, ...args];

    try {
      this.phase = Phase.Warmup;
      this.timeSource.start();
      return this.tryRunSync(applyParams);
    } catch (e: any) {
      return Status.err(e);
    }
  }
  
  toJson(): wt.Sample {
    return {
      data: this.sample().toJson(),
      samplerInfo: {
        '@type': Sampler[typeid],
        parameters: this.parameter
      }
    }
  }

  private runAsync(args: any[], baton: PromiseLike<void>): Promise<Status> {
    const fn = this.fn as Function;
    const clock = this.clock;

    function loop(onComplete: (s: Status) => void, tickId: number, baton: PromiseLike<void>) {
      baton.then(() => {
        if (clock.tock(tickId)) {
          loop(onComplete, clock.tick(), fn.apply(void 0, args));
        } else {
          onComplete(Status.ok);
        }
      }, err => {
        onComplete(Status.err(err));
      });
    }

    return new Promise<Status>(resolve => {
      loop(resolve, -1, baton);
    });
  }

  /** Attempt to run the fixture synchronously, or continue asynchronously */
  private tryRunSync(args: any[]): Status | Promise<Status> {
    const fn = this.fn as Function;
    const clock = this.clock;

    // in for-of fixtures (sync or async), this tick will be invalidated
    let tickId = clock.tick();

    const p = fn.apply(null, args);
    if (isPromise(p)) {
      return this.runAsync(args, p);
    }

    // main sampling loop
    while (clock.tock(tickId)) {
      tickId = clock.tick();
      fn.apply(null, args);
    }

    return Status.ok;
  }

  /**
   * Capture an observation.
   * @returns Whether to keep sampling.
   */
  private onObservation(valid: boolean, duration: timer.HrTime): boolean {
    assert.is(this.phase !== Phase.Ready);
    const { result, opts, durationBounds } = this;

    const e1 = this.totalElapsed, e2 = this.totalElapsed += duration;

    if (valid) {
      result.push(duration);
    }

    const elapsed = this.totalElapsed;
    const n = result.observationCount();

    if (this.phase === Phase.Warmup) {
      const [durMin, durMax] = durationBounds.warmup;

      const warmupComplete =
        (n >= opts['warmup.sampleSize.min'] && elapsed >= durMin)
        || elapsed >= durMax;

      if (warmupComplete) {
        this.gc();
        this.phase = Phase.Sampling;
        this.totalElapsed = 0n;
        this.timeSource.start();
        result.reset();
      }

      return true;
    }

    const [durMin, durMax] = durationBounds.main;
    const checkSignificance = e1 / SECOND < e2 / SECOND;

    const complete =
      // minimum criteria
      (n >= opts['sampleSize.min'] && elapsed >= durMin && checkSignificance && result.significant())
      // maximum criteria
      || (n >= opts['sampleSize.max'] || elapsed >= durMax);

    return !complete;
  }
}

class DefaultState implements StopwatchState {
  iter: Iterator<number> | null = null;

  constructor(
      private clock: timer.Clock,
      private parameter: number[]) {
  }

  [Symbol.iterator]() {
    if (this.iter === null) {
      this.iter = DefaultState.createIterator(this.clock);
    }
    return this.iter;
  }

  range(i: number): number {
    assert.gt(this.parameter.length, i);
    return this.parameter[i];
  }

  ranges(): number[] {
    return this.parameter;
  }

  keepRunning(): boolean {
    throw new Error('not impl');
  }

  set(duration: timer.HrTime) {
    this.clock.cancel(duration);
  }

  skip() {
    this.clock.cancel();
  }

  static createIterator(time: timer.Clock): Iterator<number> {
    const tickid = { done: false, value: -1 };

    return {
      next: () => {
        tickid.done = !time.tock(tickid.value);
        if (!tickid.done) {
          tickid.value = time.tick();
        }
        return tickid;
      }
    };
  }
}

/** Create a sampler or a family of samplers for a single fixture */
export class Builder<Args extends any[]>
    implements types.Builder<number, Sampler<Args>>
{
  private options: Options = Object.assign({ } as Record<string, any>,
      defaultSamplerOptions);

  private params = {
    fn: null    as SamplerFn<Args> | null,
    ranges: []  as [number, number][],
    mul: 8      as number,
    args: []    as number[][],
    units: null as q.UnitsOf<'time'> | 'auto' | null,
    timer: timer.create(),
    gc: void 0  as (() => undefined) | undefined,  
  };

  opt(key: keyof Options, value: any): this {
    this.options[key] = value;
    return this;
  }

  samplerFn(fn: SamplerFn<Args>): this {
    assert.is(typeof fn === 'function');
    this.params.fn = fn;
    return this;
  }

  range(from: number, to: number): this {
    assert.finite(from);
    assert.finite(to);
    this.params.ranges.push([from, to]);
    return this;
  }

  ranges(...ranges: [number, number][]): this {
    array.push(this.params.ranges, ranges);
    return this;
  }

  rangeMultiplier(mul: number): this {
    assert.gt(mul, 0);
    this.params.mul = mul;
    return this;
  }

  arg(x: number): this {
    this.params.args.push([x]);
    return this;
  }

  args(...xs: number[]): this {
    this.params.args.push(xs);
    return this;
  }

  report(units: q.UnitsOf<'time'> | 'auto'): this {
    this.params.units = units;
    return this;
  }

  timer(t: timer.TimeSource): this {
    this.params.timer = t;
    return this;
  }

  gc(collect: () => undefined): this {
    this.params.gc = collect;
    return this;
  }

  /** Create the samplers based on the current configuration */
  build(): Sampler<Args>[] {
    assert.is(this.params.fn !== null);
    const { fn, timer, gc } = this.params;

    if (fn !== null) {
      const inputs = this.parameterFamily();

      // default to a single parameterless sampler
      if (inputs.length === 0) inputs.push([]);
      
      return inputs.map((values: number[]) =>
          new Sampler<Args>(fn, values, this.options, timer, gc));
    }
    return [];
  }

  parameterFamily(): number[][] {
    const p = this.params;
    const values: number[][] = [];

    // args
    array.push(values, p.args);

    // ranges
    if (p.ranges.length > 0) {
      const expansions = p.ranges.map(([lo, hi]) => range(lo, hi, p.mul));
      iterator.collect(iterator.cartesianProduct(expansions), values);
    }
    
    return values;
  }
}

function range(from: number, to: number, mul: number): number[] {
  const arr: number[] = [];
  while (from < to) {
    arr.push(from);
    from *= mul;
  }
  arr.push(to);
  return arr;
}
