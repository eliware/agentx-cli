import { describe, expect, test } from '@jest/globals';
import { commandPermission, dedupeToolCalls, dedupeToolOutputs, permissionAllows, requiresToolConfirmation, runToolCall, toolCallIdentity, toolCallSummary, toolOutputForCall } from '../src/tool-dispatch.mjs';
import { cleanupTempDir, makeTempDir } from './test-helpers.mjs';

describe('tool dispatch', () => {
  test('deduplicates calls by call ID or stable fallback identity', () => {
    const first = { type: 'shell_call', call_id: 'call-1', action: { commands: ['echo one'] } };
    const duplicateId = { type: 'shell_call', call_id: 'call-1', action: { commands: ['echo different'] } };
    const noId = { type: 'shell_call', action: { commands: ['echo two'] } };
    const noIdDuplicate = { type: 'shell_call', action: { commands: ['echo two'] } };
    expect(toolCallIdentity(first, '/tmp')).toBe('id:call-1');
    expect(toolCallIdentity({ type: 'function_call', name: 'lookup', input: { z: [2, { a: 1 }] } })).toContain(JSON.stringify('name') + ':' + JSON.stringify('lookup'));
    expect(toolCallIdentity(null)).toBe(`hash:${JSON.stringify({ action: {}, arguments: '', cwd: '', name: '', type: '' })}`);
    expect(dedupeToolCalls([])).toEqual([]);
    expect(dedupeToolCalls([first, duplicateId, noId, noIdDuplicate], '/tmp')).toEqual([first, noId]);
    expect(dedupeToolOutputs([{ call_id: 'call-1', output: 'one' }, { call_id: 'call-1', output: 'duplicate' }, { output: 'same' }, { output: 'same' }, { output: { nested: [1, { b: 2, a: 1 }] } }, { output: { nested: [1, { a: 1, b: 2 }] } }])).toEqual([{ call_id: 'call-1', output: 'one' }, { output: 'same' }, { output: { nested: [1, { b: 2, a: 1 }] } }]);
    expect(commandPermission({ type: 'function_call', name: 'x' })).toBe('execute');
    expect(commandPermission({ type: 'shell_call', action: { commands: ['cat file'] } })).toBe('read');
    expect(commandPermission({ type: 'shell_call', action: { commands: ['touch file'] } })).toBe('write');
    expect(commandPermission({ type: 'shell_call', action: { commands: ['node script.js'] } })).toBe('execute');
    expect(commandPermission({ type: 'shell_call', action: { commands: ['echo hi > file'] } })).toBe('write');
    expect(commandPermission({ type: 'shell_call', action: { commands: ['unknown-tool arg'] } })).toBe('execute');
    expect(commandPermission({ type: 'shell_call', action: { commands: ['cat file | node script.js'] } })).toBe('execute');
    expect(commandPermission({ type: 'shell_call', action: { commands: ['ls && cat file'] } })).toBe('read');
    expect(permissionAllows('invalid', { type: 'shell_call', action: { commands: ['cat file'] } })).toBe(true);
    expect(permissionAllows('read', { type: 'shell_call', action: { commands: ['cat file'] } })).toBe(true);
    expect(permissionAllows('read', { type: 'shell_call', action: { commands: ['touch file'] } })).toBe(false);
    expect(permissionAllows('write', { type: 'shell_call', action: { commands: ['node script.js'] } })).toBe(false);
    expect(permissionAllows('read', { type: 'shell_call', action: { commands: ['echo hi > file'] } })).toBe(false);
    expect(requiresToolConfirmation({ type: 'shell_call', action: { commands: ['xe vm-shutdown uuid=1'] } })).toBe(true);
    expect(requiresToolConfirmation({ type: 'shell_call', action: { commands: ['printf safe'] } })).toBe(false);
    expect(requiresToolConfirmation({ type: 'function_call', name: 'shutdown' })).toBe(false);
  });

  test('runs shell tool calls and rejects unsupported tool calls', async () => {
    const tmp = makeTempDir('agentx-dispatch-');
    try {
      const shellResult = await runToolCall({ type: 'shell_call', call_id: 'call-0', action: { commands: ['node -e "process.stdout.write(\'ok\')"'], timeout_ms: 1000, max_output_length: 123 } }, tmp);
      expect(shellResult).toMatchObject({ call_id: 'call-0', status: 'completed', type: 'shell_call_output' });
      expect(shellResult.output).toEqual([{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }]);

      expect(await runToolCall({ type: 'shell_call', call_id: 'call-2', action: { commands: ['node -e "process.stdout.write(\'ok\')"'] } }, tmp)).toMatchObject({ type: 'shell_call_output', call_id: 'call-2', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] });
      expect(await runToolCall({ type: 'shell_call', id: 'call-3', action: { commands: 'node -e "process.stdout.write(\'ok\')"' } }, tmp)).toMatchObject({ type: 'shell_call_output', call_id: 'call-3', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] });
      expect(await runToolCall({ type: 'shell_call', action: { commands: 'node -e "process.stdout.write(\'ok\')"' } }, tmp)).toMatchObject({ type: 'shell_call_output', call_id: '', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] });
      expect(await runToolCall({ type: 'shell_call', call_id: 'call-empty', action: {} }, tmp)).toMatchObject({ type: 'shell_call_output', call_id: 'call-empty', output: [] });
      expect(await runToolCall({ type: 'shell_call', call_id: 'call-blocked', action: { commands: ['touch blocked'] } }, tmp, { permission: 'read' })).toMatchObject({ type: 'shell_call_output', call_id: 'call-blocked', status: 'incomplete', output: [{ outcome: { exit_code: 126 } }] });
      expect(await runToolCall({ type: 'shell_call', action: { commands: ['touch blocked'] } }, tmp, { permission: 'read' })).toMatchObject({ type: 'shell_call_output', call_id: '', status: 'incomplete', output: [{ outcome: { exit_code: 126 } }] });
      expect(toolCallSummary({ type: 'shell_call', action: { commands: ['node -e "process.stdout.write(\'ok\')"'] } }, null)).toBe('node -e "process.stdout.write(\'ok\')"');
      expect(toolCallSummary({ type: 'shell_call', action: { commands: ['first', '', null] } }, null)).toBe('first');
      expect(toolCallSummary({ type: 'shell_call', action: {} }, null)).toBe('');
      expect(await runToolCall({ type: 'weird' }, tmp)).toBe('ERROR: unsupported tool weird');
      expect(await runToolCall({ name: 'unknown', arguments: '{}' }, tmp)).toBe('ERROR: unsupported tool unknown');
      expect(await runToolCall({ type: 'function_call', name: 'agent_status', arguments: JSON.stringify({ agent_ids: ['missing-agent'] }) }, tmp)).toEqual({ agents: [{ id: 'missing-agent', status: 'unknown' }], waited: false, timed_out: false });
      expect(toolOutputForCall({ type: 'shell_call', call_id: 'call-shell', action: {} }, { type: 'shell_call_output', call_id: 'present', output: [] })).toEqual({ type: 'shell_call_output', call_id: 'present', output: [] });
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
