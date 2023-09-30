const toString = Object.prototype.toString;

function isObject(item: any): item is object {
  return item !== void 0 && typeof item === 'object' && toString.call(item) === '[object Object]';
}

const assignDeepImpl = (target: any, source: any) => {
  for (let key in source) {
    const value = source[key];

    if (!isObject(value) || !isObject(target[key])) {
      target[key] = value;
    } else {
      assignDeepImpl(target[key], value);
    }
  }
};

export const assignDeep = <T extends Record<string, any>>(target: Partial<T>, ...sources: T[]): T => {
  for (const object of sources) {
    assignDeepImpl(target, object);
  }

  return target as T;
};
