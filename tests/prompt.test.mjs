import { describe, expect, test } from '@jest/globals';
import { applyFirstUserMessage, buildInputMessage } from '../src/prompt.mjs';
import { buildDeveloperText } from '../src/prompt-text.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function makeTemplate() {
  return {
    input: [
      { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
    ],
  };
}

describe('prompt helpers', () => {
  test('prompt.json enables server-side compaction at 300k tokens', () => {
    const prompt = JSON.parse(readFileSync(path.join(process.cwd(), 'prompt.json'), 'utf8'));
    expect(prompt.context_management).toEqual([{ type: 'compaction', compact_threshold: 300000 }]);
  });

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

  test('applyFirstUserMessage leaves templates unchanged when placeholder content is missing', () => {
    const template = { input: [{ role: 'developer', content: [{ type: 'output_text', text: 'base prompt' }] }] };
    const next = applyFirstUserMessage(template, 'hello world', '', '/tmp/work');

    expect(next).not.toBe(template);
    expect(next.input[0].content[0].text).toBe('base prompt');
  });

  test('buildDeveloperText falls back to template instructions and a missing AGENTS notice', () => {
    const text = buildDeveloperText({ instructions: 'instructions only' }, '', '/tmp/work');

    expect(text).toContain('instructions only');
    expect(text).toContain('AGENTS.md not present in the current working directory or any parent directory.');
  });

  test('buildInputMessage returns a user text input payload', () => {
    expect(buildInputMessage('hi')).toEqual({
      role: 'user',
      content: [{ type: 'input_text', text: 'hi' }],
    });
  });
});
