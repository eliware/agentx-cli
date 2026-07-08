import { describe, expect, test } from '@jest/globals';
import { runToolCall, toolCallSummary, toolOutputForCall } from '../src/tool-dispatch.mjs';

describe('tool dispatch', () => {
  test('runs shell tool calls, handles parse errors and unsupported tools', async () => {
    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = () => true;
    try {
      const shellResult = JSON.parse(await runToolCall({ type: 'function_call', name: 'shell_call', call_id: 'call-0', input: JSON.stringify({ c: '/opt/agentx-cli', p: [{ s: ['printf ok'] }], t: 1000, l: 123 }) }, '/opt/agentx-cli'));
      expect(shellResult).toMatchObject({ call_id: 'call-0', cwd: '/opt/agentx-cli', status: 'completed', type: 'shell_call_output' });
      expect(shellResult.output).toEqual([{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }]);

      expect(await runToolCall({ type: 'function_call', name: 'shell_call', input: '{not valid json' }, '/opt/agentx-cli')).toContain('invalid shell_call input');
      expect(await runToolCall({ type: 'function_call', name: 'shell_call', arguments: '{not valid json' }, '/opt/agentx-cli')).toContain('invalid shell_call input');
      expect(await runToolCall({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ p: [{ s: 'printf ok' }] }) }, '/opt/agentx-cli')).toContain('shell_call_output');
      expect(await runToolCall({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ p: [] }) }, '/opt/agentx-cli')).toContain('shell_call_output');
      expect(await runToolCall({ type: 'shell_call', call_id: 'call-2', action: { commands: 'printf ok' } }, '/opt/agentx-cli')).toMatchObject({ type: 'shell_call_output', call_id: 'call-2', output: [] });
      expect(toolCallSummary({ type: 'shell_call', action: { commands: 'printf ok' } }, null)).toBe('');
      expect(await runToolCall({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] } }, '/opt/agentx-cli')).toMatchObject({ type: 'shell_call_output', call_id: 'call-1', status: 'completed' });
      expect(await runToolCall({ type: 'shell_call', action: { commands: [null] } }, '/opt/agentx-cli')).toMatchObject({ type: 'shell_call_output', call_id: '', status: 'completed' });
      expect(await runToolCall({ type: 'function_call', name: 'shell_call' }, '/opt/agentx-cli')).toBe(JSON.stringify({ type: 'shell_call_output', call_id: '', cwd: '/opt/agentx-cli', status: 'completed', output: [], max_output_length: null }));
      expect(await runToolCall({ type: 'function_call', name: 'shell_call', arguments: JSON.stringify({ p: [{ s: ['echo arg'] }] }) }, '/opt/agentx-cli')).toContain('shell_call_output');
      expect(JSON.parse(await runToolCall({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ c: '/tmp', p: [{ s: ['echo ok'] }] }) }, '/opt/agentx-cli'))).toMatchObject({ cwd: '/tmp' });
      expect(await runToolCall({ name: 'unknown', arguments: '{}' }, '/opt/agentx-cli')).toBe('ERROR: unsupported tool unknown');
    } finally {
      process.stdout.write = originalStdoutWrite;
    }
  });

  test('summarizes function and shell calls', () => {
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call', input: '{not valid json' })).toBe('{not valid json');
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ c: '/opt/agentx-cli', p: [{ s: ['printf ok'] }, { c: '/tmp', s: [] }] }) })).toBe('cd /opt/agentx-cli: printf ok || cd /tmp:');
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call', arguments: JSON.stringify({ p: [{ s: ['echo arg'] }] }) })).toBe('echo arg');
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ p: [] }) })).toBe('');
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call' })).toBe('');
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ p: [{ s: ['echo hi'] }] }) })).toBe('echo hi');
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ p: [{ s: 'echo hi' }] }) })).toBe('echo hi');
    expect(toolCallSummary({ type: 'shell_call', call_id: 'call-1', action: { commands: ['ls'] } }, null)).toBe('ls');
    expect(toolCallSummary({ type: 'shell_call', action: { commands: [null] } }, null)).toBe('');
    expect(toolCallSummary({ type: 'shell_call', action: { commands: 'printf ok' } }, null)).toBe('');
    expect(toolCallSummary({ type: 'function_call', name: 'search' })).toBe('search... OK!');
    expect(toolCallSummary({ type: 'other' }, 'ok')).toBe('other... OK!');
    expect(toolCallSummary({}, 'ok')).toBe('tool... OK!');
  });

  test('normalizes tool outputs', () => {
    expect(toolOutputForCall({ type: 'function_call', call_id: 'call-fn' }, 'done')).toEqual({ type: 'function_call_output', call_id: 'call-fn', output: 'done' });
    expect(toolOutputForCall({ type: 'function_call', id: 'call-fn-id' }, { done: true })).toEqual({ type: 'function_call_output', call_id: 'call-fn-id', output: '{"done":true}' });
    expect(toolOutputForCall({ type: 'function_call' }, undefined)).toEqual({ type: 'function_call_output', call_id: '', output: '' });
    expect(toolOutputForCall({ type: 'shell_call', call_id: 'call-shell' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: 'call-shell', output: [] });
    expect(toolOutputForCall({ type: 'shell_call', id: 'call-shell-id' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: 'call-shell-id', output: [] });
    expect(toolOutputForCall({ type: 'shell_call' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: '', output: [] });
    expect(toolOutputForCall({ type: 'shell_call', id: 'call-shell-id' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: 'call-shell-id', output: [] });
    expect(toolOutputForCall({ type: 'shell_call' }, { type: 'shell_call_output', call_id: '', output: [] })).toEqual({ type: 'shell_call_output', call_id: '', output: [] });
    expect(() => toolOutputForCall({ type: 'shell_call', call_id: 'call-shell' }, 'done')).toThrow('shell_call must return shell_call_output');
    expect(toolOutputForCall({ type: 'other' }, 'ok')).toEqual({ type: 'function_call_output', call_id: '', output: 'ok' });
  });
});
