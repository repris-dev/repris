// @ts-check
import chalk from 'chalk';
import { defaults } from '@repris/samplers';

/** @type {import("./src/config").ReprisConfig} */
export default {
  sampler: {
    options: defaults.STOPWATCH_SAMPLER
  },

  sample: {
    options: defaults.DURATION_SAMPLE,
    annotations: [
      ['duration:iter', { displayName: 'N' }],
      ['mode:hsm', { displayName: 'Mode' }],
      [
        'mode:hsm:ci-rme',
        {
          displayName: '95% CI',
          grading: {
            rules: [
              { '>=': 0, apply: chalk.green },
              { '>=': 0.05, apply: chalk.yellow },
              { '>=': 0.2, apply: chalk.red },
            ],
          },
        },
      ],
    ],
  },

  benchmark: {
    annotations: [
      [
        'benchmark:summaryText',
        {
          displayName: 'Index',
          grading: [
            'benchmark:stable',
            {
              rules: [{ '==': false, apply: chalk.dim }],
            },
          ],
        },
      ],
    ]
  },

  conflation: {
    options: defaults.DURATION_CONFLATION,
    annotations: [
      [
        'mode:hsm:conflation',
        {
          displayName: 'Mode',
          display: { if: ['show'] },
        },
      ],
      [
        'mode:hsm:conflation:ci-rme',
        {
          displayName: '95% CI',
          display: { if: ['show'] },
          grading: {
            rules: [
              { '>=': 0, apply: chalk.green },
              { '>=': 0.05, apply: chalk.yellow },
              { '>=': 0.2, apply: chalk.red },
            ],
          },
        },
      ]
    ],
  },

  comparison: {
    annotations: [
      {
        '@index': [
          [
            'mode:hsm:conflation',
            {
              displayName: 'Index',
              grading: [
                'mode:hsm:hypothesis:significantDifference',
                {
                  ctx: '@test',
                  // prettier-ignore
                  rules: [
                    { apply: chalk.dim },
                    { '<': 0, apply: chalk.reset }
                  ],
                },
              ],
            },
          ],
        ],
        '@test': [
          [
            'mode:hsm:hypothesis:summaryText',
            {
              displayName: 'Change (99% CI)',
              grading: [
                'mode:hsm:hypothesis:significantDifference',
                {
                  // prettier-ignore
                  rules: [
                    { '==': 0, apply: chalk.dim },
                    { '<': 0, apply: chalk.green },
                    { '>': 0, apply: chalk.red },
                  ],
                },
              ],
            },
          ],
          ['mode:hsm:hypothesis:difference-ci', { display: false, options: { level: 0.99 } }],
        ],
        '@baseline': [
          [
            'mode:hsm:conflation',
            {
              displayName: 'Baseline',
              grading: [
                'mode:hsm:hypothesis:significantDifference',
                {
                  ctx: '@test',
                  // prettier-ignore
                  rules: [
                    { apply: chalk.dim },
                    { '>': 0, apply: chalk.reset }
                  ],
                },
              ],
            },
          ],
        ],
      },
    ],
  },
};
