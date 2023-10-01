import * as json from './json.js';
import * as q from './quantity.js';
import { As } from './util.js';

/** A measure of time in nanoseconds */
export type HrTime = As<bigint>;

/**
 * Raw source of timing data
 */
export interface TimeSource {
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
export interface Clock {
  /** Begin one interval. A tick id is returned */
  tick(): number;

  /**
   * End the current interval. The tick id for the current must be supplied.
   * Returns whether to continue timing
   */
  tock(tickId: number): boolean;

  /** Cancel the current interval, optionally overriding the duration */
  cancel(duration?: HrTime): void;
}

export const HrTime = {
  toQuantity(time: HrTime): q.Quantity {
    return q.create('microsecond', this.toMicroseconds(time));
  },
  toMicroseconds(time: HrTime): number {
    const whole = Number(time / 1000n);
    const frac = Number(time % 1000n) / 1000;

    return whole + frac;
  },
  from(quantity: q.Quantity): HrTime {
    const us = q.convert(quantity[q.UnitTag]).to(quantity.scalar, 'microsecond').scalar;
    const whole = Math.trunc(us);
    const frac = us - whole;

    return (BigInt(whole) * 1000n + BigInt(Math.round(frac * 1000))) as HrTime;
  },
};

/**
 * Returns the string representation of a HrTime time in nanoseconds
 */
export function toString(t: HrTime) {
  return json.bigint.toJson(t);
}

/**
 * Returns the HrTime from the given string
 */
export function fromString(t: string): HrTime {
  return json.bigint.fromJson(t) as HrTime;
}

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
  emit: (valid: boolean, duration: HrTime) => boolean,
): Clock {
  let currentTick = -1;

  return {
    tick() {
      timer.start();
      return ++currentTick;
    },
    tock(id: number) {
      const t = timer.current();
      return emit(id === currentTick && currentTick >= 0, t);
    },
    cancel(duration?: HrTime) {
      if (duration !== void 0) {
        emit(true, duration);
      }
      currentTick++;
    },
  };
}

declare const process: { hrtime: { bigint(): bigint } };

function nodeJSTimer(now = 0n as HrTime): TimeSource {
  return {
    start() {
      now = process.hrtime.bigint() as HrTime;
      return now as HrTime;
    },
    current() {
      return (process.hrtime.bigint() - now) as HrTime;
    },
    clone() {
      return nodeJSTimer(now);
    },
  };
}
