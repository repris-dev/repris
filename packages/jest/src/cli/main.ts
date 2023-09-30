import * as crypto from 'crypto';

import { Command } from 'commander';
import { reset } from './reset.js';
import { show } from './show.js';
import { compare } from './compare.js';

export function run(argv: string[] = process.argv) {
  globalThis.crypto ??= {
    randomUUID() {
      return crypto.randomUUID() as any;
    },
  } as any;

  const program = new Command();

  program.name('repris').description('Repris CLI').version('0.8.0');

  program
    .command('reset')
    .description('Clears the contents of the repris index')
    .action(async _options => reset(argv));

  program
    .command('show')
    .description('Shows the snapshots and index for the repris project')
    .action(async _options => show(argv));

  program
    .command('compare')
    .description('Compare fixtures in the index to their snapshots')
    .action(async _options => compare(argv));

  program.parse(argv);
}
