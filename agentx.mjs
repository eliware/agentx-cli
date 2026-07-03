#!/usr/bin/env node
import { isDirectInvocation, promptPath } from './src/runtime.mjs';
import { runAgent } from './src/agent.mjs';

if (isDirectInvocation(import.meta.url)) {
  await runAgent({ promptPath, cwd: process.cwd() });
}
