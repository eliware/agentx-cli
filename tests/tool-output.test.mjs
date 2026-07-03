import { describe, expect, test } from '@jest/globals';
import { MAX_TOOL_OUTPUT, truncateToolOutput } from '../src/tool-output.mjs';

describe('tool output truncation', () => {
  test('truncateToolOutput leaves short output unchanged', () => {
    expect(truncateToolOutput('short')).toBe('short');
  });

  test('truncateToolOutput trims oversized output', () => {
    const text = 'x'.repeat(MAX_TOOL_OUTPUT + 1);
    const output = truncateToolOutput(text);

    expect(output.startsWith('x'.repeat(10_000))).toBe(true);
    expect(output).toContain('output truncated');
  });
});
