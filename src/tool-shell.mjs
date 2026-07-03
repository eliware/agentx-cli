import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MAX_TOOL_OUTPUT, truncateToolOutput } from './tool-output.mjs';

const execFileAsync = promisify(execFile);

async function collectSpawnOutput(command, cwd) {
  const child = execFileAsync(
    process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    process.platform === 'win32' ? ['/c', command] : ['-lc', command],
    { cwd, maxBuffer: MAX_TOOL_OUTPUT },
  );

  const { stdout = '', stderr = '' } = await child;
  const combined = [stdout, stderr].filter(Boolean).join(stderr && stdout ? '\n' : '');
  return truncateToolOutput(combined);
}

export async function shellExec(command, cwd) {
  try {
    return await collectSpawnOutput(command, cwd);
  } catch (error) {
    const message = error?.stderr || error?.stdout || error?.message || String(error);
    return truncateToolOutput(message);
  }
}
