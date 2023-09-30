import { Status } from './util.js';

/** A valid Json value */
export type Value = number | string | boolean | { [x: string]: Value } | JsonArray;
export interface JsonArray extends Array<Value> { }

/** serializing an object to Json */
export interface Serializable<J extends Value = Value> {
  toJson(): J;
}

/** deserializing an object of type T */
export interface Deserializer<T extends Serializable, J extends Value = Value> {
  fromJson(json: J): Status<T>;
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
