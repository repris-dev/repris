import { defaults } from '@sampleci/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

export default {
  roots: ['<rootDir>/.tsc/'],
  snapshotResolver: '@sampleci/util/snapshotResolver.cjs',
  testEnvironmentOptions: { customExportConditions: ['development'] },
  globals: defaults(pkg),
  reporters: [
    "default",
    ["<rootDir>/.tsc/custom-reporter.js", {"banana": "yes", "pineapple": "no"}]
  ],
  testRunner: "<rootDir>/.tsc/custom-runner.js",
};
