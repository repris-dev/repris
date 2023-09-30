/** @type {import('jest').Config} */
export default {
  reporters: [
    ['@sampleci/jest/custom-reporter', {
      columns: [
        { id: 'duration:n', displayName: 'n' },
        { id: 'duration:min', displayName: 'min' },
        {
          id: 'mode:kde',
          displayName: 'kde',
          quality: {
            id: 'mode:kde:dispersion',
            thresholds: [
              0,    // >= 0 is good
              0.03, // >= 0.03 is ok
              0.1,  // >= 0.1 is poor
            ],
          }
        },
        { id: 'mode:kde:dispersion', displayName: 'kde-d' },
        { id: 'mode:hsm', displayName: 'hsm' },
      ]
    }],
  ],
  setupFilesAfterEnv: ['@sampleci/jest/stopwatch-env'],
  testRunner: '@sampleci/jest/custom-runner',
  maxWorkers: 1,
  maxConcurrency: 1,
  testTimeout: 10_000,
};

