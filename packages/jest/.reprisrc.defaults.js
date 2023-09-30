// @ts-check
import chalk from 'chalk';
import { defaults } from '@repris/samplers';

/** @type {import("./src/config").ReprisConfig} */
export default {
  sampler: {
    options: defaults.samplers.stopwatch
  },

  sample: {
    options: defaults.samples.duration,
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
    options: defaults.conflations.duration,
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

  // prettier-ignore
  comparison: {
    annotations: [
      {
        '@index': [
          [
            'mean:conflation',
            {
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
            },
          ],
        ],
        '@test': [
          [
            'mean:hypothesis:summaryText',
            {
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
            },
          ],
          [
            'mean:hypothesis:difference-ci',
            {
              display: false,
              options: { level: 0.99 }
            }
          ],
        ],
        '@baseline': [
          [
            'mean:conflation',
            {
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
      },
    ],
  },
};
