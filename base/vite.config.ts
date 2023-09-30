import path from 'path';
import { defineConfig } from 'vite';
import * as globals from '@sampleci/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

const define = globals.defaults(pkg);
console.table(define);

export default defineConfig({
  define,
  build: {
    target: 'es2020',
    lib: {
      entry: path.resolve(__dirname, '.tsc/index.js'),
      fileName: 'index',
      formats: ['es'],
    },
    outDir: './lib',
  },
  mode: process.env.MODE,
});
