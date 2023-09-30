import { json, quantity } from '@repris/base';
import { Annotation } from './types.js';
import * as mgr from './manager.js';

describe('Annotation Serialization', () => {
  test('to/from Json Quantity', () => {
    const annotation: Annotation = {
      [quantity.UnitTag]: 'second',
      scalar: 10,
    };

    const wireType: json.Value = {
      '@unit': 'second',
      scalar: 10,
    };

    const a = mgr.toJson(annotation);
    expect(a).toEqual(wireType);

    const b = mgr.fromJson(a);
    expect(b).toEqual(annotation);
  });

  test('to/from Json Value', () => {
    const annotation: Annotation = [1, 'abc', false];
    const wireType: json.Value = [1, 'abc', false];

    const a = mgr.toJson(annotation);
    expect(a).toEqual(wireType);

    const b = mgr.fromJson(a);
    expect(b).toEqual(annotation);
  });
});
