import * as readline from 'node:readline/promises';
import * as util from 'node:util';

import chalk from 'chalk';
import { Status } from '@repris/base';

export function println(...lines: string[]): void;

export function println() {
  if (arguments.length === 0) {
    process.stdout.write('\n');
  } else {
    for (var i = 0; i < arguments.length; i++) {
      process.stdout.write(arguments[i] + '\n');
    }
  }
}

export function printf(fmt: string, ...args: any[]) {
  process.stdout.write(util.format(fmt, ...args));
}

export function eprintf(fmt: string, ...args: any[]) {
  process.stderr.write(chalk.red(util.format(fmt, ...args)));
}

/** process.exit(1) if given an error status  */
export function tryPanic<T>(s: Status<T>) {
  if (Status.isErr(s)) {
    panic(s[1]);
  }
}

export function panic(s: Error): never {
  eprintf('%O\n', s);
  process.exit(1);
}

const ansiMatch = [
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
  '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
].join('|');

export function ansiRegex(onlyFirst?: boolean) {
  return new RegExp(ansiMatch, onlyFirst ? undefined : 'g');
}

export function stripAnsi(str: string) {
  return str.replace(ansiRegex(), '');
}

export function visibleWidth(str: string) {
  return stripAnsi(str).length;
}

export async function yesNoQuestion(q: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let doDelete: boolean | undefined;

  while (doDelete === undefined) {
    const doStr = await rl.question(`${q} ${chalk.dim('(y/n)')} `);
    switch (doStr.toLowerCase()) {
      case 'y':
      case 'yes':
        doDelete = true;
        break;

      case 'n':
      case 'no':
        doDelete = false;
        break;

      default:
        println(chalk.yellow(`Expected y/n, got "${doStr}"`));
    }
  }

  rl.close();
  return doDelete;
}
