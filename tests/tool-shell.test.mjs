import { describe, expect, test } from '@jest/globals';
import { getShellLaunchers, runShellCommandGroups, runShellCommands, shellExec } from '../src/tool-shell.mjs';

describe('tool shell', () => {

  test('exposes Windows launcher order', () => {
    expect(getShellLaunchers('win32').map((item) => item.file)).toEqual(['pwsh', 'powershell.exe', 'cmd.exe']);
  });
  test('runs individual shell commands', async () => {
    const result = await runShellCommands(['printf ok'], '/opt/agentx-cli', { callId: 'call-1' });
    expect(result).toMatchObject({ type: 'shell_call_output', call_id: 'call-1', status: 'completed' });
    expect(result.output[0]).toMatchObject({ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } });
  });

  test('runs shell command groups in parallel', async () => {
    const started = Date.now();
    const result = await runShellCommandGroups([
      { c: '/opt/agentx-cli', s: ['node -e "setTimeout(() => console.log(1), 100)"'], t: 1000, l: 10 },
      { c: '/opt/agentx-cli', s: ['node -e "setTimeout(() => console.log(2), 100)"'], t: 1000, l: 10 },
    ], '/opt/agentx-cli', { callId: 'call-2' });
    expect(Date.now() - started).toBeLessThan(300);
    expect(result).toMatchObject({ type: 'shell_call_output', call_id: 'call-2', status: 'completed', cwd: '/opt/agentx-cli' });
    expect(result.output).toHaveLength(2);
    expect(result).toMatchObject({ max_output_length: 10 });
  });

  test('applies per-group timeouts and output limits', async () => {
    const result = await runShellCommandGroups([
      { c: '/opt/agentx-cli', s: ['printf abc'], t: 1000, l: 3 },
      { c: '/opt/agentx-cli', s: ['node -e "setTimeout(() => console.log(2), 200)"'], t: 50, l: 10 },
    ], '/opt/agentx-cli', { callId: 'call-3' });

    expect(result.status).toBe('incomplete');
    expect(result.output[0]).toMatchObject({ stdout: 'abc', stderr: '', outcome: { type: 'exit', exit_code: 0 } });
    expect(result.output[1]).toMatchObject({ outcome: { type: 'timeout' } });
    expect(result.max_output_length).toBe(10);
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
