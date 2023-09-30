import * as config from './config.js';
import * as util from './reporterUtils.js';

describe('gradedColumns', () => {
  test('nested annotations', function(this: any) {
    const request = {
      '@ctx': [
        ['a', {}],
        ['b', {}],
        {
          '@ctx2': [
            ['c', { displayName: 'col c' }],
          ]
        }
      ],
    } satisfies config.NestedAnnotationRequest;

    const cols = util.gradedColumns(request);

    expect(cols.length).toBe(3);
    expect(cols[0].type).toBe('a');
    expect(cols[0].ctx).toEqual(['@ctx']);

    expect(cols[1].type).toBe('b');
    expect(cols[1].ctx).toEqual(['@ctx']);

    expect(cols[2].type).toBe('c');
    expect(cols[2].ctx).toEqual(['@ctx', '@ctx2']);
    expect(cols[2].displayName).toBe('col c');
  });
});
