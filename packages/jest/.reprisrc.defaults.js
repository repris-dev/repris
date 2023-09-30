// @ts-check
import chalk from 'chalk';
import { defaults } from '@repris/samplers';

/**
 * @param {string} displayName
 * @param {import('./src/config').Ctx | undefined} ctx
 * @returns {import('./src/config').AnnotationRequest}
 */
function benchmarkSummary(displayName, ctx = undefined) {
  return ['benchmark:summaryText', {
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
  conflation: {
    options: defaults.conflations.duration
  },
  
  commands: {
    test: {
      annotations: [
        ['duration:iter', { displayName: 'N' }],
        ['mode:hsm', { displayName: 'Mode' }],
        ['mode:hsm:ci-rme', {
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
          ['mean:conflation', { displayName: 'mean'}],
          benchmarkSummary('Index', '@index'),
        ],
        '@baseline': [
          ['mean:conflation', { displayName: 'mean'}],
          benchmarkSummary('Baseline', '@baseline'),
        ]
      }]
    },

    compare: {
      annotations: [{
        '@index': [
          ['mean:conflation', {
            displayName: 'Index',
            grading: [
              // highlight if this snapshot is significantly faster
              'mean:hypothesis:significantDifference',
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
          ['mean:hypothesis:summaryText', {
            displayName: 'Change (99% CI)',
            grading: [
              // color if there is a significant difference
              'mean:hypothesis:significantDifference',
              {
                rules: [
                  { '==': 0, apply: chalk.dim },
                  { '<': 0, apply: chalk.green },
                  { '>': 0, apply: chalk.red },
                ],
              },
            ],
          }],

          ['mean:hypothesis:difference-ci', {
            display: false,
            options: { level: 0.99 }
          }],
        ],

        '@baseline': [
          ['mean:conflation', {
              displayName: 'Baseline',
              grading: [
                // highlight if this snapshot is significantly faster
                'mean:hypothesis:significantDifference',
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
