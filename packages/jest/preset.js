import { createRequire } from 'node:module';

// Resolving to actual paths ensure we use Node's own resolution algo
// rather than Jests which can't be configured from here
const resolve = createRequire(import.meta.url).resolve;

/** @type {import('jest').Config} */
export default {
  reporters: [resolve('@repris/jest/reporter'), resolve('@repris/jest/summaryReporter')],
  setupFilesAfterEnv: [resolve('@repris/jest/stopwatch-env')],
  testRunner: resolve('@repris/jest/runner'),
  maxWorkers: 1,
  maxConcurrency: 1,
  testTimeout: 15_000,
};
