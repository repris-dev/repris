// @ts-check
import chalk from 'chalk';
import { defaults } from '@repris/samplers';

/**
 * @param {string} displayName
 * @param {import('./src/config').Ctx | undefined} ctx
 * @returns {import('./src/config').AnnotationRequest}
 */
function benchmarkSummary(displayName, ctx = undefined) {
  return ['benchmark:summary-text', {
    displayName,
    grading: [
      'benchmark:stable', {
        rules: [{ '==': false, apply: chalk.dim }],
        ctx
      },
    ],
  }]
}

/** @type {import("./src/config").ReprisConfig} */
export default {
  sample: {
    options: defaults.samples.duration
  },
  sampler: {
    options: defaults.samplers.stopwatch
  },
  digest: {
    options: defaults.conflations.duration
  },
  
  commands: {
    test: {
      annotations: [
        ['duration:iter', { displayName: 'N' }],
        ['sample:hsm', { displayName: 'Mode' }],
        ['sample:hsm:ci-rme', {
          displayName: '95% CI',
          grading: {
            rules: [
              { '>=': 0, apply: chalk.green },
              { '>=': 0.05, apply: chalk.yellow },
              { '>=': 0.2, apply: chalk.red },
            ],
          },
        }],
        benchmarkSummary('Index'),
      ],
    },

    show: {
      annotations: [{
        '@index': [
          ['conflation:mean', { displayName: 'mean'}],
          benchmarkSummary('Index', '@index'),
        ],
        '@baseline': [
          ['conflation:mean', { displayName: 'mean'}],
          benchmarkSummary('Baseline', '@baseline'),
        ]
      }]
    },

    compare: {
      annotations: [{
        '@index': [
          ['conflation:mean', {
            displayName: 'Index',
            grading: [
              // highlight if this snapshot is significantly faster
              'hypothesis:mean:significant-difference',
              {
                ctx: '@test',
                rules: [
                  { apply: chalk.dim },
                  { '<': 0, apply: chalk.reset }
                ],
              },
            ],
          }],
        ],

        '@test': [
          ['hypothesis:mean:summary-text', {
            displayName: 'Change (99% CI)',
            grading: [
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
          }],

          ['hypothesis:mean:difference-ci', {
            display: false,
            options: { level: 0.99 }
          }],
        ],

        '@baseline': [
          ['conflation:mean', {
              displayName: 'Baseline',
              grading: [
                // highlight if this snapshot is significantly faster
                'hypothesis:mean:significant-difference',
                {
                  ctx: '@test',
                  rules: [
                    { apply: chalk.dim },
                    { '>': 0, apply: chalk.reset }
                  ],
                },
              ],
            },
          ],
        ],
      }],
    }
  }
};
