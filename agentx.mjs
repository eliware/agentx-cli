#!/usr/bin/env node
import { isDirectInvocation, promptPath } from './src/runtime.mjs';
import { runAgent } from './src/agent.mjs';
import { formatQuickHelp, getPackageVersion, hasFlag } from './src/cli.mjs';

function printAndExit(text, code = 0) {
  process.stdout.write(`${text}\n`);
  process.exit(code);
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, ['--help', '-h', '-?'])) {
    printAndExit(formatQuickHelp());
  } else if (hasFlag(argv, ['--version', '-v'])) {
    printAndExit(getPackageVersion());
  } else {
    await runAgent({ promptPath, cwd: process.cwd() });
  }
}
