import { assignDeep } from './assignDeep.js';

test('should deeply assign properties of additional objects to the first object', () => {
  const one = { b: { c: { d: 'e' } } };
  const two = { b: { c: { f: 'g', j: 'i' } } };

  const result = assignDeep<any>(one, two);

  expect(result).toEqual({ b: { c: { d: 'e', f: 'g', j: 'i' } } });
  expect(result).toStrictEqual(one);
});

test('should deeply assign properties from left to right', () => {
  const one = { b: { c: { d: 'e' } } };
  const two = { b: { c: { f: 'g' } } };
  const three = { b: { c: 1 } };

  const result = assignDeep<any>(one, two, three);

  expect(result).toEqual({ b: { c: 1 } });
  expect(result).toStrictEqual(one);
});

test('should deeply assign frozen objects', () => {
  const one = { b: { c: { d: 'e' } } };
  const two = Object.freeze({ b: Object.freeze({ d: 1, c: Object.freeze({ f: 'g' }) }) });
  const three = { b: { c: 1 } };

  const result = assignDeep<any>(one, two, three);

  expect(result).toEqual({ b: { c: 1, d: 1 } });
  expect(result).toStrictEqual(one);
});

test('should reassign primitives', () => {
  const one = { b: 0 };
  const two = { b: { c: 1 } };

  const result = assignDeep(one, <any>two);

  expect(result).toEqual({ b: { c: 1 } });
  expect(result).toStrictEqual(one);
});

test('should reassign with primitives', () => {
  const one = { b: { c: 1 } };
  const two = { b: 0, c: 0 };

  const result = assignDeep(one, <any>two);

  expect(result).toEqual({ b: 0, c: 0 });
  expect(result).toStrictEqual(one);
});

test('should retain properties', () => {
  const one = {  };
  const two = { b: {} };

  const result = assignDeep(one, two);

  expect(result).toEqual({ b: {} });
  expect(result).toStrictEqual(one);
});

it('should not loop over arrays', () => {
  const one = { b: { c: { d: 'e', g: ['b'] } } };
  const two = { b: { c: { d: 'f', g: ['a'] } } };

  expect(assignDeep(one, two)).toEqual({ b: { c: { d: 'f', g: ['a'] } } });
});

it('should not assign primitive arguments', () => {
  const one = { b: { c: { d: 'e', g: ['b'] } } };
  const two = 5;

  expect(assignDeep(one, <any>two)).toEqual(one);
});

it('should assign null values', () => {
  const one = { b: { c: { d: 'e', g: ['b'] } } };
  const two = { b: null, c: null };

  expect(assignDeep(one, <any>two)).toEqual({ b: null, c: null });
});

it('should assign undefined values', () => {
  const one = { b: { c: { d: 'e', g: ['b'] } } };
  const two = { b: undefined };

  expect(assignDeep(one, <any>two)).toEqual({ b: undefined });
});

it('should merge object properties without affecting any object', () => {
  const one = { a: 0, b: 1 };
  const two = { c: 2, d: 3 };
  const three = { a: 4, d: 5 };

  const actual = { a: 4, b: 1, c: 2, d: 5 };

  expect(assignDeep(<any>{}, one, two, three)).toEqual(actual);

  expect(actual).not.toStrictEqual(one);
  expect(actual).not.toStrictEqual(two);
  expect(actual).not.toStrictEqual(three);
});

it('should deeply assign symbol properties', () => {
  const foo = Symbol('foo');
  const bar = Symbol('bar');

  const a: any = { c: { e: { f: { [foo]: 'f' } } } };
  const b = { c: { e: { g: { [bar]: 'b' } } } };

  assignDeep(a, b);

  expect(a.c.e.f[foo]).toEqual('f');
  expect(a.c.e.g[bar]).toEqual('b');
});