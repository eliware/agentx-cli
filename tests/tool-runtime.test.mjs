import { describe, expect, test } from '@jest/globals';
import { MAX_TOOL_OUTPUT, truncateToolOutput } from '../src/tool-output.mjs';
import { toolCallSummary } from '../src/tool-runtime.mjs';

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
    expect(toolCallSummary({ name: 'shell_call', arguments: JSON.stringify({ command: 'ls' }) }, 'ok')).toContain('ls');
    expect(toolCallSummary({ name: 'read_file', arguments: JSON.stringify({ file_path: 'a.txt' }) }, 'ok')).toContain('a.txt');
  });
});
