import { defaults } from '@repris/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/.tsc/'],
  testMatch: ['**/*.spec.[tj]s'],
  snapshotResolver: '@repris/util/snapshotResolver.cjs',
  setupFilesAfterEnv: ['@repris/util/matchers.cjs', '@repris/util/cryptoSetup.cjs'],
  globals: defaults(pkg),
};
