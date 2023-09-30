/** @type {import('jest').Config} */
export default {
  reporters: [
    ['@sampleci/jest/custom-reporter'],
  ],
  setupFilesAfterEnv: ['@sampleci/jest/stopwatch-env'],
  testRunner: '@sampleci/jest/custom-runner',
  maxWorkers: 1,
  maxConcurrency: 1,
  testTimeout: 10_000,
};

