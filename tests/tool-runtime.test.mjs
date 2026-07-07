import { describe, expect, test } from '@jest/globals';
import { MAX_TOOL_OUTPUT, truncateToolOutput } from '../src/tool-output.mjs';
import { toolCallSummary } from '../src/tool-dispatch.mjs';

describe('tool runtime', () => {
  test('truncateToolOutput leaves short output unchanged', () => {
    expect(truncateToolOutput('short')).toBe('short');
  });

  test('truncateToolOutput trims oversized output', () => {
    const text = 'x'.repeat(MAX_TOOL_OUTPUT + 1);
    const output = truncateToolOutput(text);

    expect(output.startsWith('x'.repeat(10_000))).toBe(true);
    expect(output).toContain('output truncated');
  });

  test('toolCallSummary formats supported tools', () => {
    expect(toolCallSummary({ type: 'shell_call', call_id: 'call-1', action: { commands: ['ls'] } }, { type: 'shell_call_output', call_id: 'call-1', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }], status: 'completed' })).toContain('ls');
  });
});
