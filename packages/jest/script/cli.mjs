#!/usr/bin/env node
import * as path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;
const cli = await import(path.join(__dirname, '../.tsc/cli.js'));

cli.run();
