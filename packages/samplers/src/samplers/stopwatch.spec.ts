import { timer, Status, assignDeep } from '@repris/base';
import * as stopwatch from './stopwatch.js';
import * as defaults from '../defaults.js';
import { duration } from '../samples.js';

const opts: stopwatch.Options = assignDeep({}, defaults.samplers.stopwatch, <any>{
  warmup: { duration: { max: 100 } },
  duration: { max: 500 },
});

describe('Sampler', () => {
  test('run (synchronous)', async () => {
    let n = 0;

    const fn = () => {
      n++;
    };
    const sample = new duration.Duration(defaults.samples.duration);
    const s = new stopwatch.Sampler<[]>(fn, [], opts, sample);
    const result = await s.run();

    expect(result).toEqual(Status.ok);

    const k = s.sample().observationCount();
    expect(k > 0 && k <= n).toBeTruthy();
  });

  test('run (synchronous) passes arbitrary arguments', async () => {
    let n = 0;

    const fn = (_: any, x: number, msg: string) => {
      expect(x).toBe(1337);
      expect(msg).toBe('hello');
      n++;
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const sw = await new stopwatch.Sampler<[number, string]>(fn, [], opts, sample).run(
      1337,
      'hello',
    );

    expect(sw).toEqual(Status.ok);
    expect(n).toBeGreaterThanOrEqual(0);
  });

  test('run (synchronous) passes values', async () => {
    let n = 0;

    const fn = (state: stopwatch.StopwatchState) => {
      expect(state.range(0)).toBe(345);
      expect(state.ranges()).toEqual([345, 678]);
      n++;
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const sw = await new stopwatch.Sampler<[]>(fn, [345, 678], opts, sample).run();

    expect(sw).toEqual(Status.ok);
    expect(n).toBeGreaterThanOrEqual(0);
  });

  test('run (synchronous) catches exceptions', async () => {
    let n = 0;

    const fn = () => {
      n++;
      throw new Error('oops');
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const sw = new stopwatch.Sampler<[]>(fn, [], opts, sample);
    const result = await sw.run();

    expect(n).toBeGreaterThan(0);
    expect(Status.isErr(result as Status)).toBe(true);
    expect(sw.sample().observationCount()).toBe(0);
  });

  test('run (synchronous) manual observations', async () => {
    const fn = (state: stopwatch.StopwatchState) => {
      // manually set the observation for this iteration
      state.set(56_000_000n as timer.HrTime);
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const sw = new stopwatch.Sampler<[]>(fn, [], opts, sample);
    const result = await sw.run();

    expect(result).toEqual(Status.ok);

    for (let val of sw.sample().values()) {
      expect(val).toBe(56_000 /* us */);
    }
  });

  test('run (synchronous) skips observations', async () => {
    const fn = (state: stopwatch.StopwatchState) => {
      state.skip();
    };
    const sample = new duration.Duration(defaults.samples.duration);
    const sw = new stopwatch.Sampler<[]>(fn, [], opts, sample);
    const result = await sw.run();

    expect(result).toEqual(Status.ok);
    expect(sw.sample().observationCount()).toBe(0);
  });

  test('run (synchronous) for-of', async () => {
    let n = 0;
    let m = 0;

    const fn = (state: stopwatch.StopwatchState) => {
      m++;
      for (let _ of state) {
        n++;
      }
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const sw = new stopwatch.Sampler<[]>(fn, [], opts, sample);
    const result = await sw.run();

    expect(result).toEqual(Status.ok);
    expect(m).toEqual(1);
    expect(n).toBeGreaterThan(m);
  });

  test('run for-of (synchronous, manual observations)', async () => {
    let n = 0;
    let m = 0;

    const fn = (state: stopwatch.StopwatchState) => {
      m++;
      for (let _ of state) {
        state.set(31n as timer.HrTime);
        n++;
      }
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const sw = new stopwatch.Sampler<[]>(fn, [], opts, sample);
    const result = await sw.run();

    expect(result).toEqual(Status.ok);
    expect(m).toEqual(1);
    expect(n).toBeGreaterThan(m);

    for (let v of sw.sample().values()) {
      expect(v).toBe(0.031 /* us */);
    }
  });

  test('run (asynchronous)', () => {
    let n = 0;
    let m = 0;

    const fn = () => {
      return new Promise<void>(resolve => {
        n++;
        m++;
        setTimeout(() => {
          expect(--n).toBe(0);
          resolve();
        }, 100);
      });
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const sw = new stopwatch.Sampler<[]>(fn, [], opts, sample);
    const result = sw.run() as Promise<Status>;

    expect(result).toBeInstanceOf(Promise);

    return result.then(s => {
      expect(s).toEqual(Status.ok);
      expect(m).toBeGreaterThan(0);
      expect(n).toBe(0);
      expect(sw.sample().observationCount()).toBeGreaterThan(0);
    });
  });

  test('run (asynchronous) catches exceptions', () => {
    let n = 0;
    let m = 0;

    const fn = () => {
      m++;
      return new Promise<void>(_ => {
        n++;
        throw new Error('oops');
      });
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const sw = new stopwatch.Sampler<[]>(fn, [], opts, sample).run() as Promise<Status>;

    expect(sw).toBeInstanceOf(Promise);

    return sw.then(s => {
      expect(Status.isErr(s)).toBe(true);
      expect(n >= 0 && m === n).toBe(true);
    });
  });

  test('run (asynchronous) for-of', () => {
    let n = 0;
    let m = 0;

    const sleep = (time: number) => new Promise(resolve => setTimeout(resolve, time));
    const fn = async (state: stopwatch.StopwatchState) => {
      m++;
      for (let _ of state) {
        await sleep(100);
        n++;
      }
    };

    const sample = new duration.Duration(defaults.samples.duration);
    const result = new stopwatch.Sampler<[]>(fn, [], opts, sample).run() as Promise<Status>;
    expect(result).toBeInstanceOf(Promise);

    return result.then(s => {
      expect(s).toEqual(Status.ok);
      expect(m).toBe(1);
      expect(n).toBeGreaterThan(1);
    });
  });
});
