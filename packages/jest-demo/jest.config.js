import { defaults } from '@repris/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

// Setup sampleci dev-env within the jest host (for the reporter)
Object.assign(globalThis, defaults(pkg));

// Simulate production repris (requires a full distribution build)
const customExportConditions = process.env.NODE_ENV === 'production' ? [] : ['development'];

export default {
  preset: '@repris/jest',
  roots: ['<rootDir>/.tsc/'],
  testMatch: ['**/*.spec.[tj]s'],
  snapshotResolver: '@repris/util/snapshotResolver.cjs',
  testEnvironmentOptions: { customExportConditions },
  globals: defaults(pkg),
  cacheDirectory: '<rootDir>/.jestcache/',
  transform: {},
};
