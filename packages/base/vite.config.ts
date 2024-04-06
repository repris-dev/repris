import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import * as globals from '@repris/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

const define = globals.defaults(pkg);
console.table(define);

export default defineConfig({
  define,
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: '.tsc/index.js',
      fileName: 'index',
      formats: ['cjs', 'es'],
    },
    rollupOptions: {
      external: id => id.startsWith('node:'),
    },
    outDir: './lib',
  },
  plugins: [dts({ compilerOptions: { declarationMap: false } })],
  mode: process.env.MODE,
});
