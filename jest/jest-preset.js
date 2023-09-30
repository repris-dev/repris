/** @type {import('jest').Config} */
export default {
  reporters: [
    ['@sampleci/jest/custom-reporter', {
      columns: [
        { id: 'duration:iter', displayName: 'iter.' },
        { id: 'duration:min', displayName: 'min' },
        { id: 'mode:hsm:conflation', displayName: 'snapshot-hsm' },
        { id: 'mode:hsm:conflation:ci-rme',
          displayName: 'hsm-rme',
          quality: {
            id: 'mode:hsm:conflation:ci-rme',
            thresholds: [
              0,    // >= good
              0.05, // >= ok
              0.1,  // >= poor
            ],
          }
        },
        { id: 'mode:hsm', displayName: 'hsm' },
        { id: 'mode:hsm:ci-rme',
          displayName: 'hsm-rme',
          quality: {
            id: 'mode:hsm:ci-rme',
            thresholds: [
              0,    // >= good
              0.05, // >= ok
              0.1,  // >= poor
            ],
          }
        },
      ]
    }],
  ],
  setupFilesAfterEnv: ['@sampleci/jest/stopwatch-env'],
  testRunner: '@sampleci/jest/custom-runner',
  maxWorkers: 1,
  maxConcurrency: 1,
  testTimeout: 10_000,
};

