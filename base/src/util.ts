//
// Common types
//

export type Indexable<T> = { [i: number]: T; readonly length: number; }

//
// Error codes, status, results
//

export type Status<T = unknown> = [null, Error] | [T];

export namespace Status {
  export const ok: Status = [1];

  export function err<T = any>(msg: string | Error): Status<T> {
    return typeof msg === 'string'
        ? [null, new Error(msg)]
        : [null, msg];
  }

  export function isErr(s: Status): s is [null, Error] {
    return s.length === 2;
  }

  export function value<T>(val: T): Status<T> {
    return [val];
  }

  /** Get the status value or throw an exception */
  export function get<T>(s: Status<T>): T {
    if (isErr(s)) { throw s[1]; }
    return s[0];
  }

  export function getOr<T>(s: Status<T>, defaultValue: T): T {
    if (isErr(s)) { return defaultValue; }
    return s[0];
  }
}


//
// Opaque and runtime type information
//

/** Opaque data type for typescript */
export type As<T> = T & { readonly '': unique symbol };

/** symbol which identifies the type of an object at runtime */
export const typeid = Symbol.for('@typeid');

/** typeid value type */
export type typeid = string & As<'@typeid'>;

//
// Helpers
//

export function isPromise(p: void | PromiseLike<void>): p is PromiseLike<void> {
  return p !== undefined && typeof (<PromiseLike<void>>p).then === 'function';
}

export function isObject(item: any): item is object {
  return item && typeof item === 'object' && !Array.isArray(item) && item !== null;
}
