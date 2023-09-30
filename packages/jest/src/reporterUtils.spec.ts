import type * as config from './config.js';
import * as util from './reporterUtils.js';

describe('gradedColumns', () => {
  test('nested annotations', () => {
    // prettier-ignore
    const request = [{
      '@ctx': [
        ['a', {}],
        ['b', {}],
        {
          '@ctx2': [
            ['c', { displayName: 'col c' }],
          ]
        }
      ],
    }] satisfies config.AnnotationRequestTree;

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

  test('conditional display', () => {
    // prettier-ignore
    const request = [
      ['a', { display: { if: ['condition 1'] }}],
      ['b', { display: false }],
      {
        '@ctx2': [
          ['c', { displayName: 'col c' }],
        ]
      }
    ] satisfies config.AnnotationRequestTree;

    {
      const cols = util.gradedColumns(request, void 0, 'condition 1');
      expect(cols).toEqual([
        { type: 'a', displayName: 'a' },
        { ctx: ['@ctx2'], type: 'c', displayName: 'col c' },
      ]);
    }

    {
      const cols = util.gradedColumns(request, void 0);
      expect(cols).toEqual([{ ctx: ['@ctx2'], type: 'c', displayName: 'col c' }]);
    }
  });
});
