import * as assert from './assert.js';
import { As } from './util.js';

export enum Unit {
  nanosecond  = 'ns',
  microsecond = '\u03bcs',
  millisecond = 'ms',
  second      = 's',
  hz          = ' ops/sec'
}

export type UnitType = keyof typeof Unit;

export type HrTime = As<bigint>

export interface Timer
{
  /** Begin or restart the timer. Returns the current time */
  start(): HrTime;

  /** Get the current elapsed time since the last call to start() */
  current(): HrTime;

  /** Clones the timer state */
  clone(): Timer;
}

/**
 * A timer which emits durations between a 'tick' and its
 * corresponding 'tock'.
 * 
 * @param emit A function which when called with a duration returns
 * whether the consumer should stop polling
 */
export interface Hand
{
  /** Begin the timer, returning a timer id */
  tick(): number;

  /** Emit a duration. Returns whether to continue timing */
  tock(id: number): boolean;

  /** Cancel the current timer, optionally overriding the duration */
  cancel(duration?: HrTime): void;
}

/** Convert a htTime to a numeric value */
export function cvtTo(time: HrTime, units: UnitType): HrTime {
  switch (units) {
    case 'nanosecond':  return time;
    case 'microsecond': return time / 100n as HrTime;
    case 'millisecond': return time / 1000_000n as HrTime;
    case 'second':      return time / 1000_000_000n as HrTime;
    case 'hz':          return time / 1000_000_000_000n as HrTime;
  }
  throw new Error(`Unknown Unit '${ units }'`);
}


/**
 * Returns the numeric high resolution time in nanoseconds
 * as a 64-bit floating point number
 */
export function toString(t: HrTime) {
  // TODO: encoding durations larger than 2^53-1
  return t.toString() + 'n';
};

/**
 * Returns the numeric high resolution time in nanoseconds
 * as a 64-bit floating point number
 */
 export function fromString(t: string): HrTime {
  assert.gt(t.length, 0);
  assert.eq(t[t.length - 1], 'n');
  
  return BigInt(t.substring(0, t.length - 2)) as HrTime;
};

/** Returns a high-resolution timer for the current runtime */
export function create(): Timer {
  // @ts-ignore: Test for nodejs
  if (typeof process !== 'object' || typeof process.hrtime !== 'function') {
    throw new Error('Runtime not supported');
  }
  return nodeJSTimer();
}

export function createHand(
  timer: Timer,
  emit: (valid: boolean, duration: HrTime) => boolean
): Hand {
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

function nodeJSTimer(now = 0n as HrTime): Timer {
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
