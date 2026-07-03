import { describe, expect, test } from '@jest/globals';
import { applyFirstUserMessage, buildInputMessage } from '../src/prompt.mjs';
import { buildDeveloperText } from '../src/prompt-text.mjs';

function makeTemplate() {
  return {
    input: [
      { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
    ],
  };
}

describe('prompt helpers', () => {
  test('buildDeveloperText includes identity guidance, cwd and AGENTS content', () => {
    const text = buildDeveloperText({ input: [{ role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] }] }, 'AGENTS body', '/tmp/work');

    expect(text).toContain('base prompt');
    expect(text).toContain('Identity guidance: You are AgentX');
    expect(text).toContain('created by Eli Sterling (eliware.org)');
    expect(text).toContain('Current working directory: /tmp/work');
    expect(text).toContain('AGENTS body');
    expect(text).toContain('Terminal guidance: You are in a terminal.');
  });

  test('applyFirstUserMessage replaces the first user placeholder', () => {
    const next = applyFirstUserMessage(makeTemplate(), 'hello world', 'AGENTS body', '/tmp/work');

    expect(next.input[0].content[0].text).toContain('/tmp/work');
    expect(next.input[0].content[0].text).toContain('AGENTS body');
    expect(next.input[1].content[0].text).toBe('hello world');
  });

  test('buildInputMessage returns a user text input payload', () => {
    expect(buildInputMessage('hi')).toEqual({
      role: 'user',
      content: [{ type: 'input_text', text: 'hi' }],
    });
  });
});
