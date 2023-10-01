import { defineConfig } from 'vite';
import * as globals from '@repris/util/globals.config';
import pkg from './package.json' assert { type: 'json' };

const define = globals.defaults(pkg);
console.table(define);

const __dirname = new URL('.', import.meta.url).pathname;

console.info('__dirname', __dirname);
export default defineConfig({
  define,
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: [
        '.tsc/reporter.js',
        '.tsc/summaryReporter.js',
        '.tsc/runner.js',
        '.tsc/setupStopwatch.js',
        '.tsc/cli.js',
      ],
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
