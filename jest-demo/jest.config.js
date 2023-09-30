import { defaults } from '@sampleci/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

// Setup sampleci dev-env within the jest host (for the reporter)
Object.assign(globalThis, defaults(pkg));

export default {
  preset: '@sampleci/jest',
  roots: ['<rootDir>/.tsc/'],
  testMatch: ['**/*.spec.[tj]s'],
  snapshotResolver: '@sampleci/util/snapshotResolver.cjs',
  testEnvironmentOptions: { customExportConditions: ['development'] },
  globals: defaults(pkg),
};
