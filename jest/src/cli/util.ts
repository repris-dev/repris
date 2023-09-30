import * as util from 'util';
import chalk from 'chalk';
import { Status } from '@sampleci/base';

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

export function panic<T>(s: Error) {
  eprintf('%O\n', s);
  process.exit(1);
}
