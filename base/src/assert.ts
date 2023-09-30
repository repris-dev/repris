export function assertionsEnabled() {
  return __DEBUG;
}

function err (msg: string) {
  throw new Error('[Failed assertion] ' + msg);
}

export function eq(a: any, b: any): void {
  if (__DEBUG) {
    if (a !== b) err(`Expected ${a} to equal ${b}.`);
  }
}

export function is(val: any): void {
  if (__DEBUG) {
    if (!val) err(`Expected ${val} to be truthy`);
  }
}

export function le(a: any, b: any): void {
  if (__DEBUG) {
    if (a > b) err(`Expected ${a} to be <= ${b}`);
  }
}

export function lt(a: any, b: any): void {
  if (__DEBUG) {
    if (a >= b) err(`Expected ${a} to be < ${b}`);
  }
}

export function gt(a: any, b: any): void {
  if (__DEBUG) {
    if (a <= b) err(`Expected ${a} to be > ${b}`);
  }
}

export function bounds(arr: ArrayLike<any>, idx: number) {
  if (__DEBUG) {
    if (idx < 0 || idx >= arr.length) err(`Expected ${idx} to be a valid element`);
  }
}

export function finite(val: any): void {
  if (__DEBUG) {
    if (typeof val !== 'number' && !isFinite(val)) {
      err(`Expected ${val} to be a finite number`);
    }
  }
}

export function valuesEq(a: ArrayLike<any>, b: ArrayLike<any>): void {
  if (__DEBUG) {
    if (a.length !== a.length) {
      err(`Expected array length ${a} to equal ${b}`);
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        err(`Expected array entries at index ${i} to be equal. (${a[i]} vs. ${b[i]})`);
      }
    }
  }
}
