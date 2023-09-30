import { defaults } from '@sampleci/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

export default {
  roots: ['<rootDir>/.tsc/'],
  snapshotResolver: '@sampleci/util/snapshotResolver.cjs',
  setupFilesAfterEnv: ['@sampleci/util/matchers.cjs'],
  globals: defaults(pkg),
};
