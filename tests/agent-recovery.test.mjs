import { describe, expect, test } from '@jest/globals';
import { buildInterruptedToolOutput, createResumeToolCallRunner } from '../src/agent/recovery.mjs';

describe('agent recovery helpers', () => {
  test('builds interruption output for shell calls', () => {
    const result = buildInterruptedToolOutput({ type: 'shell_call', call_id: 'c1' }, 'request');
    expect(result).toMatchObject({ type: 'shell_call_output', call_id: 'c1', status: 'completed' });
    expect(result.output[0].stdout).toContain('Stop all further tool calls');
  });

  test('builds retry guidance for function calls', () => {
    expect(buildInterruptedToolOutput({ type: 'function_call', call_id: 'c1' }, 'retry')).toContain('Think carefully');
  });

  test('uses request guidance for auto mode and pending calls', async () => {
    const runner = createResumeToolCallRunner('auto', new Set(['c1']));
    const result = await runner({ type: 'function_call', call_id: 'c1' }, '/tmp');
    expect(result).toContain('Ask the user what they want');
  });

  test('uses retry guidance for uncertain calls', async () => {
    const runner = createResumeToolCallRunner('retry', new Set(), new Set(['id:c2']));
    const result = await runner({ type: 'function_call', call_id: 'c2' }, '/tmp');
    expect(result).toContain('Think carefully');
  });

  test('runs a safe non-pending tool call through dispatch', async () => {
    const runner = createResumeToolCallRunner('retry');
    await expect(runner({ type: 'function_call', name: 'goal_update', call_id: 'c3', input: 'done' }, '/tmp')).resolves.toBe('done');
  });

  test('dispatches calls identified by id', async () => {
    const runner = createResumeToolCallRunner('request', new Set(), new Set());
    await expect(runner({ type: 'function_call', name: 'unsupported_tool', call_id: 'c4' }, '/tmp')).resolves.toContain('ERROR: unsupported tool');
  });
});
