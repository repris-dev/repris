import { defaults } from '@repris/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

// Setup sampleci dev-env within the jest host (for the reporter)
Object.assign(globalThis, defaults(pkg));

export default {
  preset: '@repris/jest',
  roots: ['<rootDir>/.tsc/'],
  testMatch: ['**/*.spec.[tj]s'],
  snapshotResolver: '@repris/util/snapshotResolver.cjs',
  testEnvironmentOptions: { customExportConditions: ['development'] },
  globals: defaults(pkg),
  cacheDirectory: '<rootDir>/.jestcache/',
  transform: {}
};
