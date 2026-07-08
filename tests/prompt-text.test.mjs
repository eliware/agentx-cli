import { describe, expect, test } from '@jest/globals';
import { buildDeveloperText } from '../src/prompt-text.mjs';

describe('prompt text', () => {
  test('includes identity guidance, role guidance, cwd and AGENTS content', () => {
    const text = buildDeveloperText({ input: [{ role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] }] }, 'AGENTS body', '/tmp/work');

    expect(text).toContain('base prompt');
    expect(text).toContain('Identity guidance: You are AgentX');
    expect(text).toContain('created by Eli Sterling (eliware.org)');
    expect(text).toContain('Role guidance: You are AgentX in the role of System Administrator, DevOps, and Developer.');
    expect(text).toContain('Tool-use guidance: Always prefer bulk parallel tool calls whenever possible. Only use sequential command lists when the order of execution is important.');
    expect(text).toContain('Current working directory: /tmp/work');
    expect(text).toContain('AGENTS body');
    expect(text).toContain('Terminal guidance: You are in a terminal.');
  });

  test('falls back to template instructions and a missing AGENTS notice', () => {
    const text = buildDeveloperText({ instructions: 'instructions only' }, '', '/tmp/work');

    expect(text).toContain('instructions only');
    expect(text).toContain('AGENTS.md not present in the current working directory or any parent directory. Consider creating one.');
  });
});
