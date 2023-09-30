import { defaults } from '@sampleci/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

export default {
  roots: ['<rootDir>/.tsc/'],
  testMatch: ['**/*.spec.[tj]s'],
  snapshotResolver: '@sampleci/util/snapshotResolver.cjs',
  testEnvironmentOptions: { customExportConditions: ['development'] },
  globals: defaults(pkg),
};
