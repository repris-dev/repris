import { defineConfig } from 'vite';
import * as globals from '@repris/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

const define = globals.defaults(pkg);
console.table(define);

export default defineConfig({
  define,
  build: {
    target: 'es2022',
    lib: {
      entry: '.tsc/index.js',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: id =>
        id.startsWith('node:') || Object.keys(pkg.dependencies).some(dep => id.startsWith(dep)),
    },
    outDir: './lib',
  },
  mode: process.env.MODE,
});
