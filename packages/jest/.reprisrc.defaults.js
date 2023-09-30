// @ts-check
import chalk from 'chalk';

/** @type {import("./src/config").ReprisConfig} */
export default {
  sampler: {
    options: {},
  },

  sample: {
    options: {},
    annotations: [
      ['duration:iter', { displayName: 'N' }],
      ['mode:hsm', { displayName: 'Mode' }],
      [
        'mode:hsm:ci-rme',
        {
          displayName: 'CI (95%)',
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

  conflation: {
    options: {},
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
          displayName: 'CI (95%)',
          display: { if: ['show'] },
          grading: {
            rules: [
              { '>=': 0, apply: chalk.green },
              { '>=': 0.05, apply: chalk.yellow },
              { '>=': 0.2, apply: chalk.red },
            ],
          },
        },
      ],
      [
        'duration:conflation:summaryText',
        {
          displayName: 'Index',
          grading: [
            'conflation:ready',
            {
              rules: [{ '==': false, apply: chalk.dim }],
            },
          ],
        },
      ],
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
        '@snapshot': [
          [
            'mode:hsm:conflation',
            {
              displayName: 'Snapshot',
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
