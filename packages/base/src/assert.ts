export function assertionsEnabled() {
  return __DEBUG;
}

function err(msg: string): never {
  throw new Error('[Failed assertion] ' + msg);
}

export function eq(a: any, b: any, msg?: string): void {
  if (__DEBUG) {
    if (a !== b) err(msg ?? `Expected ${a} to equal ${b}.`);
  }
}

export function is(val: any, msg?: string): void {
  if (__DEBUG) {
    if (!val) err(msg ?? `Expected ${val} to be truthy`);
  }
}

export function isDefined<T>(val: T | undefined | null, msg?: string): asserts val is T {
  if (__DEBUG) {
    if (typeof val === 'undefined' || val === null) {
      err(msg ?? `Expected ${val} to be defined`);
    }
  }
}

export function le(a: any, b: any, msg?: string): void {
  if (__DEBUG) {
    if (a > b) err(msg ?? `Expected ${a} to be <= ${b}`);
  }
}

export function lt(a: any, b: any, msg?: string): void {
  if (__DEBUG) {
    if (a >= b) err(msg ?? `Expected ${a} to be < ${b}`);
  }
}

export function lte(a: any, b: any, msg?: string): void {
  if (__DEBUG) {
    if (a > b) err(msg ?? `Expected ${a} to be <= ${b}`);
  }
}

export function gt(a: any, b: any, msg?: string): void {
  if (__DEBUG) {
    if (a <= b) err(msg ?? `Expected ${a} to be > ${b}`);
  }
}

export function gte(a: any, b: any, msg?: string): void {
  if (__DEBUG) {
    if (a < b) err(msg ?? `Expected ${a} to be >= ${b}`);
  }
}

export function inRange(val: any, min: any, max: any, msg?: string): void {
  if (__DEBUG) {
    if (val < min || val > max) err(msg ?? `Expected ${min} >= ${val} <= ${max}`);
  }
}

export function bounds(arr: ArrayLike<any>, idx: number, msg?: string) {
  if (__DEBUG) {
    if (idx < 0 || idx >= arr.length) err(msg ?? `Expected ${idx} to be a valid element`);
  }
}

export function finite(val: any, msg?: string): void {
  if (__DEBUG) {
    if (typeof val !== 'number' && !isFinite(val)) {
      err(msg ?? `Expected ${val} to be a finite number`);
    }
  }
}

// @ts-ignore
export function never(msg?: string): never {
  if (__DEBUG) {
    err(msg ?? 'Unexpected');
  }
}

export function valuesEq(a: ArrayLike<any>, b: ArrayLike<any>): void {
  if (__DEBUG) {
    if (a.length !== a.length) {
      err(`Expected array length ${a} to equal ${b}`);
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        err(`Expected array entries at index ${i} to be equal. (${a[i]} > ${b[i]})`);
      }
    }
  }
}

export function isSorted(a: ArrayLike<any>): void {
  if (__DEBUG) {
    if (a.length < 2) return;
    for (let i = 1; i < a.length; i++) {
      if (a[i] < a[i - 1]) {
        err(`Expected array to be sorted. (${a[i - 1]} vs. ${a[i]})`);
      }
    }
  }
}
