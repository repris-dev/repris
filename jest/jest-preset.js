/** @type {import('jest').Config} */
export default {
  reporters: [
    ['@sampleci/jest/custom-reporter', {
      columns: [
        { id: 'duration:iter', displayName: 'iter.' },
        { id: 'duration:min', displayName: 'min' },
        {
          id: 'mode:kde',
          displayName: 'kde',
          quality: {
            id: 'mode:kde:dispersion',
            thresholds: [
              0,    // >= good
              0.02, // >= ok
              0.1,  // >= poor
            ],
          }
        },
        { id: 'mode:kde:dispersion', displayName: 'kde-d' },
        { id: 'mode:hsm',
          displayName: 'hsm',
          quality: {
            id: 'mode:hsm:dispersion',
            thresholds: [
              0,    // >= good
              0.02, // >= ok
              0.1,  // >= poor
            ],
          }
        },
        { id: 'mode:hsm:dispersion', displayName: 'hsm-d' },
        { id: 'mode:lms',
          displayName: 'lms',
          
        },
        { id: 'mode:lms:dispersion', displayName: 'lms-d' },
      ]
    }],
  ],
  setupFilesAfterEnv: ['@sampleci/jest/stopwatch-env'],
  testRunner: '@sampleci/jest/custom-runner',
  maxWorkers: 1,
  maxConcurrency: 1,
  testTimeout: 10_000,
  globalSetup: '@sampleci/jest/global-setup'
};

