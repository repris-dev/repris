import { defaults } from '@repris/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

export default {
  roots: ['<rootDir>/.tsc/'],
  testMatch: ['**/*.spec.[tj]s'],
  snapshotResolver: '@repris/util/snapshotResolver.cjs',
  testEnvironmentOptions: { customExportConditions: ['development'] },
  globals: defaults(pkg),
};
