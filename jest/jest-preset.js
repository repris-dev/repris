/** @type {import('jest').Config} */
export default {
  reporters: [
    '@repris/jest/reporter',
    '@repris/jest/summaryReporter',
  ],
  setupFilesAfterEnv: ['@repris/jest/stopwatch-env'],
  testRunner: '@repris/jest/runner',
  maxWorkers: 1,
  maxConcurrency: 1,
  testTimeout: 10_000,
};
