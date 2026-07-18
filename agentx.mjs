#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { getHomeDirectory } from './src/platform.mjs';

const homeDirectory = getHomeDirectory();
/* istanbul ignore else -- dotenv bootstrap is environment-dependent. */
if (homeDirectory) {
  loadDotenv({ path: join(homeDirectory, '.agentx'), quiet: true });
}


const { isDirectInvocation, promptPath } = await import('./src/runtime.mjs');
const { runAgent } = await import('./src/agent.mjs');
const { formatQuickHelp, getPackageVersion, hasFlag } = await import('./src/cli.mjs');

function printAndExit(text, code = 0) {
  process.stdout.write(`${text}\n`);
  process.exit(code);
}

/* istanbul ignore next -- interactive bootstrap is covered by CLI smoke tests. */
async function confirmSetup() {
  if (process.env.NODE_ENV === 'test') return false;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const configFile = homeDirectory ? join(homeDirectory, '.agentx') : '';
  if (configFile && existsSync(configFile) && (process.env.agentx_api_key || process.env.AGENTX_API_KEY)) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('AgentX is not configured. Run agentx-setup now? [Y/n] ')).trim().toLowerCase();
    if (answer && answer !== 'y' && answer !== 'yes') return false;
    rl.close();
    const { runSetup, setupPaths } = await import('./src/setup.mjs');
    await runSetup({ stdin: process.stdin, stdout: process.stdout });
    loadDotenv({ path: setupPaths.envPath, quiet: true, override: true });
    return Boolean(existsSync(setupPaths.envPath) && (process.env.agentx_api_key || process.env.AGENTX_API_KEY));
  } finally { rl.close(); }
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
      await confirmSetup();
      await runAgent({ promptPath, cwd: process.cwd() });
    } catch (error) {
      printStartupError(error);
      process.exit(1);
    }
  }
}
