import * as json from './json.js';
import { divRounded } from './math.js';
import { As } from './util.js';

export enum Unit {
  nanosecond  = 'ns',
  microsecond = '\u03bcs',
  millisecond = 'ms',
  second      = 's',
  hz          = ' ops/sec'
}

export type UnitType = keyof typeof Unit;

/** A measure of time in nanoseconds */
export type HrTime = As<bigint>

/**
 * Raw source of timing data
 */
export interface TimeSource
{
  /** Begin or restart the timer. Returns the current time */
  start(): HrTime;

  /** Get the current elapsed time since the last call to start() */
  current(): HrTime;

  /** Clones the timer state */
  clone(): TimeSource;
}

/**
 * A Clock which emits durations between a 'tick' and its
 * corresponding 'tock'.
 * 
 * @param emit A function which when called with a duration returns
 * whether the consumer should stop polling
 */
export interface Clock
{
  /** Begin the timer, returning a timer id */
  tick(): number;

  /** Emit a duration. Returns whether to continue timing */
  tock(id: number): boolean;

  /** Cancel the current timer, optionally overriding the duration */
  cancel(duration?: HrTime): void;
}

/** Convert a HrTime to a numeric value in the given units */
export function cvtTo(time: HrTime, units: UnitType): bigint {
  switch (units) {
    case 'nanosecond':  return time;
    case 'microsecond': return divRounded(time, 1000n);
    case 'millisecond': return divRounded(time, 1000_000n);
    case 'second':      return divRounded(time, 1000_000_000n);
    case 'hz':          return divRounded(time, 1000_000_000_000n);
  }
  throw new Error(`Unknown Unit '${ units }'`);
}

/** Convert a value in the given units to a HrTime */
export function cvtFrom(time: number | string | bigint, units: UnitType): HrTime {
  // TODO - big-decimal required to accurately convert floating point values
  //   to the nearest bigint
  const t = typeof time === 'number'
    ? BigInt(Math.round(time))
    : typeof time === 'string'
    ? BigInt(time.replace(/\..*/, '')) // remove decimals
    : time;

  switch (units) {
    case 'nanosecond':  return t as HrTime;
    case 'microsecond': return t * 1000n as HrTime;
    case 'millisecond': return t * 1000_000n as HrTime;
    case 'second':      return t * 1000_000_000n as HrTime;
    case 'hz':          return t * 1000_000_000_000n as HrTime;
  }
  throw new Error(`Unknown Unit '${ units }'`);
}

/**
 * Returns the string representation of a HrTime time in nanoseconds
 */
export function toString(t: HrTime) {
  return json.bigint.toJson(t);
};

/**
 * Returns the HrTime from the given string
 */
 export function fromString(t: string): HrTime {
  return json.bigint.fromJson(t) as HrTime;
};

/** Returns a high-resolution timer for the current runtime */
export function create(): TimeSource {
  // @ts-ignore: Test for nodejs
  if (typeof process !== 'object' || typeof process.hrtime !== 'function') {
    throw new Error('Runtime not supported');
  }
  return nodeJSTimer();
}

export function createClock(
  timer: TimeSource,
  emit: (valid: boolean, duration: HrTime) => boolean
): Clock {
  let tickId = -1;

  return {
    tick() {
      timer.start();
      return ++tickId;
    },
    tock(id: number) {
      return emit(id === tickId && tickId >= 0, timer.current());
    },
    cancel(duration?: HrTime) {
      if (typeof duration === 'object') { emit(true, duration); }
      tickId++;
    }
  };
}

declare const process: { hrtime: { bigint(): bigint }};

function nodeJSTimer(now = 0n as HrTime): TimeSource {
  function start() {
    now = process.hrtime.bigint() as HrTime;
    return now as HrTime;
  }

  function current() {
    return process.hrtime.bigint() - now as HrTime;
  }

  function clone() {
    return nodeJSTimer(now);
  }

  return { start, current, clone };
}
