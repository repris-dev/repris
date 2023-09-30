import { Status, isPromise, typeid, assert, array, timer, iterator, math } from '@sampleci/base';
import * as types from './types.js';
import * as samples from './samples.js';
import * as wt from './wireTypes.js';

/** Type of function which can be sampled by the stopwatch */
export type SamplerFn<Args extends any[]> = types.SamplerFn<timer.HrTime, StopwatchState, Args>

/** options supported by the sampler */
export type SamplerOptions = typeof defaultSamplerOptions;

/** State available to the function under test */
export interface StopwatchState extends types.SamplerState<timer.HrTime>
{
  keepRunning(): boolean;

  range(i?: number): number;
  ranges(): number[];
}

export const defaultSamplerOptions = {
  /* Time to spend collecting the sample (ms) */
  'duration.min': 500,
  'duration.max': 7_500,

  /* The range of observations to take for the sample */
  'sampleSize.min': 10,
  'sampleSize.max': 5_000,

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

const SECOND = timer.cvtFrom(1, 'second');

/**
 * Implementation of a micro-benchmarking sampler
 */
export class Sampler<Args extends any[] = []> implements types.Sampler<timer.HrTime> {
  static readonly [typeid] = '@sampler:stopwatch' as typeid;
  
  readonly opts: SamplerOptions;
  readonly state: StopwatchState;
  readonly clock: timer.Clock;
  readonly result: samples.MutableSample<timer.HrTime>;
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
    opts: Partial<SamplerOptions> = { },
    timeSource = timer.create(),
    private readonly gc: () => void = (() => {})
  )
  {
    this.clock = timer.createClock(timeSource, this.onObservation.bind(this));
    this.opts = Object.assign({}, defaultSamplerOptions, opts);
    this.state = new DefaultState(this.clock, parameter);
    this.timeSource = timeSource.clone();

    this.result = new samples.Duration(
      this.opts['reservoirSample.capacity'] < 0 ? this.opts['sampleSize.max'] : this.opts['reservoirSample.capacity']
    );

    this.durationBounds = {
      main: [
        timer.cvtFrom(this.opts['duration.min'], 'millisecond'),
        timer.cvtFrom(this.opts['duration.max'], 'millisecond'),
      ],
      warmup: [
        timer.cvtFrom(this.opts['warmup.duration.min'], 'millisecond'),
        timer.cvtFrom(this.opts['warmup.duration.max'], 'millisecond'),
      ]
    }
  }

  sample(): samples.Sample<timer.HrTime> {
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
    const { result, timeSource, opts, durationBounds } = this;

    let e1 = this.totalElapsed, e2 = e1;

    if (valid) {
      e2 = this.totalElapsed += duration;
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

        result.reset();
        timeSource.start();
      }
      return true;
    }

    const [durMin, durMax] = durationBounds.main;
    const checkSignificance = e1 / SECOND < e2 / SECOND;

    const complete =
      // minimum criteria
      (n >= opts['sampleSize.min'] && elapsed >= durMin && checkSignificance && this.isSignificant())
      // maximum criteria
      || (n >= opts['sampleSize.max'] || elapsed >= durMax);

    return !complete;
  }

  private isSignificant() {
    return this.result.significant();
  }
}

class DefaultState implements StopwatchState {
  iter: Iterator<number> | null = null;

  constructor(
      private time: ReturnType<typeof timer.createClock>,
      private parameter: number[]) {
  }

  [Symbol.iterator]() {
    if (this.iter === null) {
      this.iter = DefaultState.createIterator(this.time);
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
    this.time.cancel(duration);
  }

  skip() {
    this.time.cancel();
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
    implements types.Builder<timer.HrTime, Sampler<Args>>
{
  private options = Object.assign({ } as Record<string, any>,
      defaultSamplerOptions);

  private params = {
    fn: null    as SamplerFn<Args> | null,
    ranges: []  as [number, number][],
    mul: null   as number | null,
    args: []    as number[][],
    units: null as timer.UnitType | 'auto' | null,
    timer: timer.create(),
    gc: void 0  as (() => undefined) | undefined,  
  };

  opt(key: keyof SamplerOptions, value: any): this {
    this.options[key as any] = value;
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

  rangeMultiplier(mul: number) {
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

  report(units: timer.UnitType | 'auto'): this {
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
      const mul = typeof p.mul === 'number' ? p.mul : this.options['family.multiplier'];
      const expansions = p.ranges.map(([lo, hi]) => range(lo, hi, mul));

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
