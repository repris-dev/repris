import d from './data.json';

export function hello() {
  if (__DEBUG) {
    console.info(d);
  }
  return d;
}

export function version() {
  return __PKG_VERSION;
}
