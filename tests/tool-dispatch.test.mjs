import { describe, expect, test } from '@jest/globals';
import { runToolCall, toolCallSummary, toolOutputForCall } from '../src/tool-dispatch.mjs';
import { cleanupTempDir, makeTempDir } from './test-helpers.mjs';

describe('tool dispatch', () => {
  test('runs shell tool calls and rejects unsupported tool calls', async () => {
    const tmp = makeTempDir('agentx-dispatch-');
    try {
      const shellResult = await runToolCall({ type: 'shell_call', call_id: 'call-0', action: { commands: ['node -e "process.stdout.write(\'ok\')"'], timeout_ms: 1000, max_output_length: 123 } }, tmp);
      expect(shellResult).toMatchObject({ call_id: 'call-0', status: 'completed', type: 'shell_call_output' });
      expect(shellResult.output).toEqual([{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }]);

      expect(await runToolCall({ type: 'shell_call', call_id: 'call-2', action: { commands: ['node -e "process.stdout.write(\'ok\')"'] } }, tmp)).toMatchObject({ type: 'shell_call_output', call_id: 'call-2', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] });
      expect(toolCallSummary({ type: 'shell_call', action: { commands: ['node -e "process.stdout.write(\'ok\')"'] } }, null)).toBe('node -e "process.stdout.write(\'ok\')"');
      expect(await runToolCall({ type: 'weird' }, tmp)).toBe('ERROR: unsupported tool weird');
      expect(await runToolCall({ name: 'unknown', arguments: '{}' }, tmp)).toBe('ERROR: unsupported tool unknown');
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('summarizes shell calls', () => {
    expect(toolCallSummary({ type: 'shell_call', call_id: 'call-1', action: { commands: ['ls'] } }, null)).toBe('ls');
    expect(toolCallSummary({ type: 'shell_call', action: { commands: [null] } }, null)).toBe('');
    expect(toolCallSummary({ type: 'shell_call', action: { commands: 'printf ok' } }, null)).toBe('printf ok');
    expect(toolCallSummary({ type: 'function_call', name: 'search' })).toBe('search... OK!');
    expect(toolCallSummary({ type: 'other' }, 'ok')).toBe('other... OK!');
    expect(toolCallSummary({}, 'ok')).toBe('tool... OK!');
  });

  test('normalizes tool outputs', () => {
    expect(toolOutputForCall({ type: 'function_call', call_id: 'call-fn' }, 'done')).toEqual({ type: 'function_call_output', call_id: 'call-fn', output: 'done' });
    expect(toolOutputForCall({ type: 'function_call', id: 'call-fn-id' }, { done: true })).toEqual({ type: 'function_call_output', call_id: 'call-fn-id', output: '{"done":true}' });
    expect(toolOutputForCall({ type: 'function_call' }, undefined)).toEqual({ type: 'function_call_output', call_id: '', output: '' });
    expect(toolOutputForCall({ type: 'other' }, null)).toEqual({ type: 'function_call_output', call_id: '', output: '' });
    expect(toolOutputForCall({ type: 'shell_call', call_id: 'call-shell' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: 'call-shell', output: [] });
    expect(toolOutputForCall({ type: 'shell_call', id: 'call-shell-id' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: 'call-shell-id', output: [] });
    expect(toolOutputForCall({ type: 'shell_call' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: '', output: [] });
    expect(toolOutputForCall({ type: 'shell_call', id: 'call-shell-id' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: 'call-shell-id', output: [] });
    expect(toolOutputForCall({ type: 'shell_call' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: '', output: [] });
    expect(() => toolOutputForCall({ type: 'shell_call', call_id: 'call-shell' }, 'done')).toThrow('shell_call must return shell_call_output');
    expect(toolOutputForCall({ type: 'other' }, 'ok')).toEqual({ type: 'function_call_output', call_id: '', output: 'ok' });
  });
});
