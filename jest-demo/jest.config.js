import { defaults } from '@sampleci/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

Object.assign(globalThis, defaults(pkg));

export default {
  roots: ['<rootDir>/.tsc/'],
  testEnvironmentOptions: { customExportConditions: ['development'] },
  globals: defaults(pkg),
  reporters: [
    '@sampleci/jest/custom-reporter',
  ],
  setupFilesAfterEnv: ['@sampleci/jest/stopwatch-env'],
  testRunner: '@sampleci/jest/custom-runner',
  maxWorkers: 1,
  testRegex: '\\.tsc/.*\\.js$'
};
