import { isDirectInvocation, promptPath } from './runtime.mjs';
import { runAgent } from './agent.mjs';

if (isDirectInvocation(import.meta.url)) {
  await runAgent({ promptPath, cwd: process.cwd() });
}
