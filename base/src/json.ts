import { assert } from './index.js';
import { Status } from './util.js';

/** A valid Json value */
export type Value = number | string | boolean | { [x: string]: Value } | Array<Value>;

/** serializing an object to Json */
export interface Serializable<J extends Value = Value> {
  toJson(): J;
}

/** deserializing an object of type T */
export interface Deserializer<T extends Serializable, J extends Value = Value> {
  fromJson(json: J): Status<T>;
}

/** Gets the serialized type of T */
export type AsSerialized<T> =
  T extends Serializable<infer J> ? J
  : never;

export namespace bigint {
  export function toJson(x: bigint): string {
    return x.toString() + 'n';
  };
  
  export function fromJson(t: string): bigint {
    assert.gt(t.length, 0);
    assert.eq(t[t.length - 1], 'n');
    
    return BigInt(t.substring(0, t.length - 1));
  }

  /** @returns true if the given Json value is a string-encoded bigint */
  export function isJsonBigint(x: Value): x is string {
    return typeof x === 'string' && /^-*\d+n$/.test(x);
  }
}

/**
 * Implementation of the JSON Canonicalization Scheme
 * https://tools.ietf.org/html/draft-rundgren-json-canonicalization-scheme-02
 */
export function stringify(object: Value, buffer = ''): string {
  return serialize(object, buffer);
}

function serialize(object: Value, buffer: string): string {
  if (object === null || typeof object !== 'object') {
    // Primitive data type - Use ES6/JSON 
    buffer += JSON.stringify(object);

  } else if (Array.isArray(object)) {
    // Array - Maintain element order     
    buffer += '[';
    let next = false;
    object.forEach((element) => {
      if (next) {
        buffer += ',';
      }
      next = true;
      // Array element - Recursive expansion
      buffer += serialize(element, '');
    });
    buffer += ']';

  } else {
    // Object - Sort properties before serializing
    buffer += '{';
    let next = false;
    Object.keys(object).sort().forEach((property) => {
      if (next) {
        buffer += ',';
      }
      next = true;
      // Property names are strings - Use ES6/JSON
      buffer += JSON.stringify(property);
      buffer += ':';
      // Property value - Recursive expansion
      buffer += serialize(object[property], '');
    });
    buffer += '}';
  }
  return buffer;
}
