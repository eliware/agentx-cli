import { describe, expect, test } from '@jest/globals';
import { clearTerminal, formatCommandMessage, formatInfoMessage, formatPromptForCwd, formatSystemMessage } from '../src/shell-display.mjs';

describe('shell display', () => {
  test('formats prompt and messages and clears the terminal', () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalUser = process.env.USER;

    try {
      process.stdout.write = (chunk) => {
        writes.push(String(chunk));
        return true;
      };
      delete process.env.USER;

      expect(formatPromptForCwd('/tmp/work')).toContain('root@dev:/tmp/work');
      expect(formatSystemMessage('hello')).toBe('[33mhello[0m');
      expect(formatCommandMessage('hello')).toBe('[32mhello[0m');
      expect(formatInfoMessage('hello')).toBe('[94mhello[0m');
      clearTerminal();
      expect(writes).toContain('c');
    } finally {
      process.stdout.write = originalWrite;
      if (originalUser === undefined) delete process.env.USER;
      else process.env.USER = originalUser;
    }
  });
});
