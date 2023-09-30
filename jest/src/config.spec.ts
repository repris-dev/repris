import { iterator } from '@repris/base';
import * as config from './config.js';

describe('iterateAnnotationTree', () => {
  test('iterates a tree of annotations', () => {
    // prettier-ignore
    const request = [{
      '@ctx': [
        ['a', {}],
        ['b', {
          grading: ['c', { ctx: '@ctx3', options: { foo: 1 } }]
        }],
        {
          '@ctx2': [
            ['d', { options: { foo: 2 } }],
            'e',
          ]
        }
      ],
    }] satisfies config.AnnotationRequestTree;

    const configs = iterator.collect(config.iterateAnnotationTree(request));
    expect(configs).toEqual([
      { ctx: ['@ctx'], type: 'a' },
      { ctx: ['@ctx'], type: 'b' },
      { ctx: ['@ctx3'], type: 'c', options: { foo: 1 } },
      { ctx: ['@ctx', '@ctx2'], type: 'd', options: { foo: 2 } },
      { ctx: ['@ctx', '@ctx2'], type: 'e' },
    ]);
  });

  test('iterates an array of annotations', () => {
    // prettier-ignore
    const request = [
      ['a', { options: { foo: 0 }}],
      ['a', { options: { foo: 1 }}],
      ['b', {
        grading: ['c', { ctx: '@ctx3', options: { foo: 2 } }]
      }],
      'd'
    ] satisfies config.AnnotationRequestTree;

    const configs = iterator.collect(config.iterateAnnotationTree(request));
    expect(configs).toEqual([
      { ctx: undefined, type: 'a', options: { foo: 0 } },
      { ctx: undefined, type: 'a', options: { foo: 1 } },
      { ctx: undefined, type: 'b', options: undefined },
      { ctx: ['@ctx3'], type: 'c', options: { foo: 2 } },
      { ctx: undefined, type: 'd', options: undefined },
    ]);
  });
});

describe('annotationRequester', () => {
  test('contexts', () => {
    // prettier-ignore
    const cfgs = [{
      '@ctx': [
        ['a', {}],
        ['b', {
          grading: ['c', { ctx: '@ctx3', options: { foo: 1 } }]
        }],
        {
          '@ctx2': [
            ['d', { options: { foo: 2 } }],
            'e',
          ]
        }
      ],
    }] satisfies config.AnnotationRequestTree;

    const requestBuilder = config.parseAnnotations(cfgs);

    {
      const req = requestBuilder('@ctx');
      expect(iterator.collect(req.keys())).toEqual(['a', 'b', 'd', 'e']);
    }
    {
      const req = requestBuilder('@ctx3');
      expect(iterator.collect(req.keys())).toEqual(['c']);
    }
  });
});
