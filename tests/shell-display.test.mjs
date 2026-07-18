import { describe, expect, test } from '@jest/globals';
import { clearTerminal, formatCommandMessage, formatInfoMessage, formatMcpMessage, formatPromptForCwd, formatSystemMessage } from '../src/shell-display.mjs';

describe('shell display', () => {
  test('formats prompt and messages and clears the terminal', () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalTTY = process.stdout.isTTY;
    const originalUser = process.env.USER;
    const originalUsername = process.env.USERNAME;
    const originalHost = process.env.HOSTNAME;
    const originalComputer = process.env.COMPUTERNAME;

    try {
      process.stdout.write = (chunk) => {
        writes.push(String(chunk));
        return true;
      };
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
      process.env.USER = 'alice';
      process.env.HOSTNAME = 'laptop';
      delete process.env.USERNAME;
      delete process.env.COMPUTERNAME;

      expect(formatPromptForCwd('/tmp/work')).toBe(`[33malice@laptop:/tmp/work#[0m `);
      expect(formatSystemMessage('hello')).toBe(`[33mhello[0m`);
      expect(formatCommandMessage('hello')).toBe(`[32mhello[0m`);
      expect(formatInfoMessage('hello')).toBe(`[94mhello[0m`);
      expect(formatMcpMessage('hello')).toBe(`[36mhello[0m`);
      clearTerminal();
      expect(writes).toContain('\n');

      writes.length = 0;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      clearTerminal();
      expect(writes).toContain('\x1b[2J\x1b[H');
    } finally {
      process.stdout.write = originalWrite;
      Object.defineProperty(process.stdout, 'isTTY', { value: originalTTY, configurable: true });
      if (originalUser === undefined) delete process.env.USER; else process.env.USER = originalUser;
      if (originalUsername === undefined) delete process.env.USERNAME; else process.env.USERNAME = originalUsername;
      if (originalHost === undefined) delete process.env.HOSTNAME; else process.env.HOSTNAME = originalHost;
      if (originalComputer === undefined) delete process.env.COMPUTERNAME; else process.env.COMPUTERNAME = originalComputer;
    }
  });
});
