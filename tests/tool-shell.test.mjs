import { describe, expect, test } from '@jest/globals';
import { runShellCommandGroups, runShellCommands, shellExec } from '../src/tool-shell.mjs';

describe('tool shell', () => {
  test('runs individual shell commands', async () => {
    const result = await runShellCommands(['printf ok'], '/opt/agentx-cli', { callId: 'call-1' });
    expect(result).toMatchObject({ type: 'shell_call_output', call_id: 'call-1', status: 'completed' });
    expect(result.output[0]).toMatchObject({ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } });
  });

  test('runs shell command groups in parallel', async () => {
    const started = Date.now();
    const result = await runShellCommandGroups([
      { c: '/opt/agentx-cli', s: ['node -e "setTimeout(() => console.log(1), 100)"'] },
      { c: '/opt/agentx-cli', s: ['node -e "setTimeout(() => console.log(2), 100)"'] },
    ], '/opt/agentx-cli', { callId: 'call-2' });
    expect(Date.now() - started).toBeLessThan(300);
    expect(result).toMatchObject({ type: 'shell_call_output', call_id: 'call-2', status: 'completed', cwd: '/opt/agentx-cli' });
    expect(result.output).toHaveLength(2);
  });

  test('shellExec streams and returns command output', async () => {
    const writes = [];
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    try {
      await expect(shellExec('printf hello', '/opt/agentx-cli')).resolves.toBe('hello');
      expect(writes.join('')).toContain('hello');
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }
  });
});
