import { describe, expect, test } from '@jest/globals';
import { applyFirstUserMessage, buildInputMessage } from '../src/prompt-builder.mjs';

function makeTemplate() {
  return {
    input: [
      { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
    ],
  };
}

describe('prompt builder', () => {
  test('replaces the first user placeholder and preserves developer text', () => {
    const next = applyFirstUserMessage(makeTemplate(), 'hello world', 'AGENTS body', '/tmp/work');

    expect(next.input[0].content[0].text).toContain('/tmp/work');
    expect(next.input[0].content[0].text).toContain('AGENTS body');
    expect(next.input[1].content[0].text).toBe('hello world');
  });

  test('leaves templates unchanged when placeholder content is missing', () => {
    const template = { input: [{ role: 'developer', content: [{ type: 'output_text', text: 'base prompt' }] }] };
    const next = applyFirstUserMessage(template, 'hello world', '', '/tmp/work');

    expect(next).not.toBe(template);
    expect(next.input[0].content[0].text).toBe('base prompt');
  });

  test('buildInputMessage returns a user text input payload', () => {
    expect(buildInputMessage('hi')).toEqual({
      role: 'user',
      content: [{ type: 'input_text', text: 'hi' }],
    });
  });
});
