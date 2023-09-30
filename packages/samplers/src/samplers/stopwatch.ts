import { Status, typeid, assert, timer, quantity as q } from '@repris/base';
import * as types from './types.js';
import * as samples from '../samples.js';
import * as wt from '../wireTypes.js';

export interface Options {
  /** warmup options */
  warmup: {
    duration: { min: number, max: number },
    sampleSize: { min: number }
  };

  /* Time to spend collecting the sample (ms) */
  duration: { min: number, max: number };

  /* The range of observations to take for the sample */
  sampleSize: { min: number, max: number };
}

/** Type of function which can be sampled by the stopwatch */
export type SamplerFn<Args extends any[]> = types.SamplerFn<timer.HrTime, StopwatchState, Args>

/** State available to the function under test */
export interface StopwatchState extends types.SamplerState<timer.HrTime>
{
  keepRunning(): boolean;
  range(i?: number): number;
  ranges(): number[];
}

/**
 * V8 garbage collection API
 * See: https://github.com/nodejs/node/blob/main/deps/v8/src/extensions/gc-extension.h
 */
export interface V8GC {
  (): void;
  (opt: { type: 'major' | 'minor', execution: 'sync' }): void;
  (opt: { type: 'major' | 'minor', execution: 'async' }): Promise<void>;
}

const enum Phase {
  Ready = 0,
  Warmup = 1,
  Sampling = 2,
  Complete = 3
}

const NoopGC: V8GC = () => Promise.resolve(); 

const SECOND = timer.HrTime.from(q.create('second', 1));

/**
 * Implementation of a micro-benchmarking sampler
 */
export class Sampler<Args extends any[] = []> implements types.Sampler<number> {
  static readonly [typeid] = '@sampler:stopwatch' as typeid;

  readonly state: StopwatchState;
  readonly clock: timer.Clock;
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
    private opts: Options,
    public result: samples.MutableSample<timer.HrTime, number>,
    timeSource = timer.create(),
    private readonly gc: V8GC = NoopGC
  )
  {
    this.clock = timer.createClock(timeSource, this.onObservation.bind(this));
    this.state = new DefaultState(this.clock, parameter);
    this.timeSource = timeSource.clone();

    this.durationBounds = {
      main: [
        timer.HrTime.from(q.create('millisecond', opts.duration.min)),
        timer.HrTime.from(q.create('millisecond', opts.duration.max)),
      ],
      warmup: [
        timer.HrTime.from(q.create('millisecond', opts.warmup.duration.min)),
        timer.HrTime.from(q.create('millisecond', opts.warmup.duration.max)),
      ]
    }
  }

  sample(): samples.Sample<number> {
    return this.result;
  }

  /** Start capturing samples */
  run(...args: Args): Promise<Status> {
    if (this.phase !== Phase.Ready) { throw new Error('The stopwatch is already running'); }

    // TODO: measure the overhead of .apply()
    const applyParams = [this.state, ...args];

    this.phase = Phase.Warmup;
    this.timeSource.start();

    return this.runAsync(applyParams);
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

  /** Attempt to run the benchmark asynchronously */
  private async runAsync(args: any[]): Promise<Status> {
    const fn = this.fn as Function;
    const clock = this.clock;

    await this.gc({ type: 'major', execution: 'async' });

    try {
      // main sampling loop
      while (this.phase !== Phase.Complete) {
        const tickId = clock.tick();
        // Run one iteration
        await fn.apply(null, args);
        // in for-of benchmarks (sync or async), this tick will be invalidated
        clock.tock(tickId);
      }
    } catch (e) {
      return Status.err(e as Error);
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
        (n >= opts.warmup.sampleSize.min && elapsed >= durMin)
        || elapsed >= durMax;

      if (warmupComplete) {
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
      (n >= opts.sampleSize.min && elapsed >= durMin && checkSignificance && result.significant())
      // maximum criteria
      || (n >= opts.sampleSize.max || elapsed >= durMax);

    if (complete) {
      this.phase = Phase.Complete;
    }

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
