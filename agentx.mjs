#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env'), quiet: true });

const { isDirectInvocation, promptPath } = await import('./src/runtime.mjs');
const { runAgent } = await import('./src/agent.mjs');
const { formatQuickHelp, getPackageVersion, hasFlag } = await import('./src/cli.mjs');

function printAndExit(text, code = 0) {
  process.stdout.write(`${text}\n`);
  process.exit(code);
}

function printStartupError(error) {
  process.stderr.write(`${error?.message || String(error)}\n`);
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, ['--help', '-h', '-?'])) {
    printAndExit(formatQuickHelp());
  } else if (hasFlag(argv, ['--version', '-v'])) {
    printAndExit(getPackageVersion());
  } else {
    try {
      await runAgent({ promptPath, cwd: process.cwd() });
    } catch (error) {
      printStartupError(error);
      process.exit(1);
    }
  }
}
