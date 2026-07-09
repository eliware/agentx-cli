import { describe, expect, test } from '@jest/globals';
import { getShellLaunchers, runShellCommandSequence, runShellCommands, shellExec } from '../src/tool-shell.mjs';
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

  test('runs shell command sequences in order', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      const result = await runShellCommandSequence([
        { cwd: tmp, command: 'node -e "process.stdout.write(\'one\')"', timeoutMs: 1000, maxOutputLength: 10 },
        { cwd: tmp, command: 'node -e "process.stdout.write(\'two\')"', timeoutMs: 1000, maxOutputLength: 10 },
      ], { callId: 'call-2', defaultCwd: tmp });

      expect(result).toMatchObject({ type: 'shell_call_output', call_id: 'call-2', status: 'completed' });
      expect(result.output).toHaveLength(2);
      expect(result.output[0]).toMatchObject({ stdout: 'one', stderr: '', outcome: { type: 'exit', exit_code: 0 } });
      expect(result.output[1]).toMatchObject({ stdout: 'two', stderr: '', outcome: { type: 'exit', exit_code: 0 } });
      expect(result.max_output_length).toBe(10);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('applies timeouts and truncates output per step', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      const result = await runShellCommandSequence([
        { cwd: tmp, command: 'node -e "process.stdout.write(\'abc\')"', timeoutMs: 1000, maxOutputLength: 3 },
        { cwd: tmp, command: 'node -e "setTimeout(() => console.log(2), 200)"', timeoutMs: 50, maxOutputLength: 10 },
      ], { callId: 'call-3', defaultCwd: tmp });

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
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    const stdoutChunks = [];
    const stderrChunks = [];
    process.stdout.write = (chunk) => { stdoutChunks.push(String(chunk)); return true; };
    process.stderr.write = (chunk) => { stderrChunks.push(String(chunk)); return true; };

    try {
      const output = await shellExec("node -e \"process.stdout.write('hello'); process.stderr.write('oops')\"", tmp);
      expect(output).toMatchObject({ stdout: 'hello', stderr: 'oops', outcome: { type: 'exit', exit_code: 0 } });
      expect(stdoutChunks.join('')).toContain('hello');
      expect(stderrChunks.join('')).toContain('oops');
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      cleanupTempDir(tmp);
    }
  });
});
