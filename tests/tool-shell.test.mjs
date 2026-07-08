import { describe, expect, test } from '@jest/globals';
import { getShellLaunchers, runShellCommandGroups, runShellCommands, shellExec } from '../src/tool-shell.mjs';
import { cleanupTempDir, makeTempDir } from './test-helpers.mjs';

describe('tool shell', () => {
  test('exposes Windows launcher order', () => {
    expect(getShellLaunchers('win32').map((item) => item.file)).toEqual(['pwsh', 'powershell.exe', 'cmd.exe']);
  });

  test('runs individual shell commands', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      const result = await runShellCommands(['node -e "process.stdout.write(\'ok\')"'], tmp, { callId: 'call-1' });
      expect(result).toMatchObject({ type: 'shell_call_output', call_id: 'call-1', status: 'completed' });
      expect(result.output[0]).toMatchObject({ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('runs shell command groups in parallel', async () => {
    const started = Date.now();
    const tmp = makeTempDir('agentx-shell-');
    try {
      const result = await runShellCommandGroups([
        { c: tmp, s: ['node -e "setTimeout(() => console.log(1), 100)"'], t: 1000, l: 10 },
        { c: tmp, s: ['node -e "setTimeout(() => console.log(2), 100)"'], t: 1000, l: 10 },
      ], tmp, { callId: 'call-2' });
      expect(Date.now() - started).toBeLessThan(1000);
      expect(result).toMatchObject({ type: 'shell_call_output', call_id: 'call-2', status: 'completed', cwd: tmp });
      expect(result.output).toHaveLength(2);
      expect(result).toMatchObject({ max_output_length: 10 });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('applies per-group timeouts and output limits', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      const result = await runShellCommandGroups([
        { c: tmp, s: ['node -e "process.stdout.write(\'abc\')"'], t: 1000, l: 3 },
        { c: tmp, s: ['node -e "setTimeout(() => console.log(2), 200)"'], t: 50, l: 10 },
      ], tmp, { callId: 'call-3' });

      expect(result.status).toBe('incomplete');
      expect(result.output[0]).toMatchObject({ stdout: 'abc', stderr: '', outcome: { type: 'exit', exit_code: 0 } });
      expect(result.output[1]).toMatchObject({ outcome: { type: 'timeout' } });
      expect(result.max_output_length).toBe(10);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('shellExec streams and returns command output', async () => {
    if (process.platform === 'win32') return;
    const tmp = makeTempDir('agentx-shell-');
    const writes = [];
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    try {
      const output = await shellExec('echo hello', tmp);
      expect(output).toContain('hello');
      expect(writes.join('')).toContain('hello');
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }
  });
});
