import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { createReplInterface, printAgentText, printResumeMessage, printUsageReport, promptForCwd } from '../src/agent/repl.mjs';

describe('agent repl helpers', () => {
  let originalWrite;
  let writes;

  beforeEach(() => {
    originalWrite = process.stdout.write;
    writes = [];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
  });

  afterEach(() => { process.stdout.write = originalWrite; });

  test('creates readline with current-directory completion and history', async () => {
    const input = { on() {}, removeListener() {}, resume() {}, pause() {} };
    const output = { write() {} };
    const cwd = () => process.cwd();
    const rl = createReplInterface(cwd, input, output, ['previous']);
    expect(rl.history).toEqual(['previous']);
    await expect(rl.completer('src/a')).resolves.toBeDefined();
    rl.close();
  });

  test('creates readline without history when history is not an array', () => {
    const input = { on() {}, removeListener() {}, resume() {}, pause() {} };
    const output = { write() {} };
    const rl = createReplInterface(() => process.cwd(), input, output, null);
    expect(rl.history).not.toEqual(['previous']);
    rl.close();
    const defaults = createReplInterface(() => process.cwd());
    defaults.close();
  });

  test('prints wrapped agent text with and without a trailing newline', () => {
    printAgentText('hello');
    printAgentText('already done\n');
    expect(writes.join('')).toContain('hello');
    expect(writes.join('')).toContain('already done\n');
  });

  test('prints resume messages only when text exists', () => {
    printResumeMessage('Resume', 'continue');
    printResumeMessage('Resume', '');
    expect(writes.join('')).toContain('Resume:');
    expect(writes.join('')).toContain('continue');
    expect(writes.join('')).not.toContain('Resume:\nResume:');
  });

  test('prints usage with optional leading newline and model', () => {
    printUsageReport({ inputTokens: 1, cachedTokens: 0, outputTokens: 2, turns: 1 }, { model: 'test-model' });
    printUsageReport({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, { leadingNewline: true });
    printUsageReport({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 });
    expect(writes.join('')).toContain('"in":"1');
    expect(writes.join('')).toContain('\n\u001b[38;5;33m');
  });

  test('formats cwd prompt', () => {
    expect(promptForCwd('/tmp/work')).toContain('/tmp/work');
    expect(promptForCwd('/tmp/work')).toContain('#');
  });
});
