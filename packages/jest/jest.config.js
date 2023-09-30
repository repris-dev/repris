import { defaults } from '@repris/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

export default {
  roots: ['<rootDir>/.tsc/'],
  testMatch: ['**/*.spec.[tj]s'],
  snapshotResolver: '@repris/util/snapshotResolver.cjs',
  testEnvironmentOptions: { customExportConditions: ['development'] },
  globals: defaults(pkg),
  // Workaround for https://github.com/jestjs/jest/issues/12270 (Fixed in Jest 29)
  moduleNameMapper: {
    '#ansi-styles': 'ansi-styles/index.js',
    '#supports-color': 'supports-color/index.js',
  }
};
