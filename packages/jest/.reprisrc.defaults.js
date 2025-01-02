// @ts-check
import chalk from 'chalk';
import strip from 'strip-ansi';
import { defaults } from '@repris/samplers';

/**
 * @param {string} displayName
 * @param {import('./src/config.js').Ctx | undefined} ctx
 * @returns {import('./src/config.js').AnnotationRequest}
 */
function benchmarkSummary(displayName, ctx = undefined) {
  return [
    'benchmark:summary-text',
    {
      displayName,
      grading: [
        'benchmark:snapshottable',
        {
          rules: [{ '==': false, apply: chalk.dim }],
          ctx,
        },
      ],
    },
  ];
}

/** @type {import("./src/config.js").ReprisConfig["commands"]["show"]} */
const show = {
  annotations: [
    {
      '@index': [
        ['digest:mean', { displayName: 'avg.' }],
        benchmarkSummary('Index', '@index')
      ],
      '@baseline': [
        ['digest:mean', { displayName: 'avg.' }],
        benchmarkSummary('Baseline', '@baseline'),
      ],
    },
  ],
};

/** @type {import("./src/config.js").ReprisConfig["commands"]["test"]} */
const test = {
  annotations: [
    ['duration:iter', { displayName: 'Iter.' }],
    ['sample:hsm', { displayName: 'Mode' }],
    [
      'sample:hsm:ci-rme',
      {
        displayName: '95% CI',
        grading: {
          rules: [
            { '>=': 0, apply: chalk.green },
            { '>=': 0.1, apply: chalk.yellow },
            { '>=': 0.2, apply: chalk.red },
          ],
        },
        brand: {
          /** @type {any} */
          with: 'sample:noisy',
          when: { '>': 0.2 },
        },
      },
    ],
    [
      'benchmark:snapshottable',
      {
        display: false,
        options: {
          minSize: 15,
          minNormalitySignificance: 0.05
        }
      }
    ],
    benchmarkSummary('Index'),
  ],
};

/** @type {import("./src/config.js").ReprisConfig["commands"]["compare"]} */
const compare = {
  annotations: [
    {
      '@index': [
        [
          'digest:mean',
          {
            displayName: 'Index',
            grading: [
              // highlight if this snapshot is significantly faster
              'hypothesis:mean:significant-difference',
              {
                ctx: '@test',
                rules: [{ apply: chalk.dim }, { '<': 0, apply: chalk.reset }],
              },
            ],
          },
        ],
      ],

      '@test': [
        [
          'hypothesis:mean:summary-text',
          {
            displayName: 'Change (99% CI)',
            gradings: [
              [
                // color if there is a significant difference
                'hypothesis:mean:significant-difference',
                {
                  rules: [
                    { '==': 0, apply: chalk.dim },
                    { '<': 0, apply: chalk.green },
                    { '>': 0, apply: chalk.red },
                  ],
                },
              ],
              [
                // color yellow if there is a significant but meaningless difference
                // e.g. lower than the minim effect-size
                'hypothesis:mean:meaningful-difference',
                {
                  rules: [{ '==': false, apply: str => chalk.yellow(strip(str)) }],
                },
              ],
            ],
          },
        ],
        [
          'hypothesis:mean:effect-size',
          {
            displayName: 'Effect',
            style: chalk.grey,
            gradings: [
              [
                // color yellow if there is a significant but meaningless difference
                // e.g. lower than the minim effect-size
                'hypothesis:mean:meaningful-difference',
                {
                  rules: [
                    { '==': true, apply: str => chalk.green(strip(str)) }
                  ],
                },
              ],
            ],
          }
        ],
        ['hypothesis:mean:difference-ci', { display: false }],
      ],

      '@baseline': [
        [
          'digest:mean',
          {
            displayName: 'Baseline',
            grading: [
              // highlight if this snapshot is significantly faster
              'hypothesis:mean:significant-difference',
              {
                ctx: '@test',
                rules: [{ apply: chalk.dim }, { '>': 0, apply: chalk.reset }],
              },
            ],
          },
        ],
      ],
    },
  ],
};

/** @type {import("./src/config.js").ReprisConfig} */
export default {
  sample: {
    options: defaults.samples.duration,
  },

  sampler: {
    options: defaults.samplers.stopwatch,
  },

  digest: {
    options: defaults.digests.duration,
  },

  commands: {
    test,
    show,
    compare,
  },
};
