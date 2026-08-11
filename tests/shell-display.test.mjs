import { describe, expect, test } from '@jest/globals';
import { clearTerminal, formatCommandMessage, formatCustomToolMessage, formatInfoMessage, formatMcpMessage, formatPromptForCwd, formatSystemMessage, formatUsageMessage, formatFinalUsageMessage } from '../src/shell-display.mjs';
import { setTerminalOutputOptions } from '../src/terminal-output.mjs';

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

      expect(formatPromptForCwd('/tmp/work')).toBe(`[38;5;37malice@laptop:/tmp/work[38;5;255m#[0m[38;5;255m `);
      expect(formatSystemMessage('hello')).toBe(`[38;5;160mhello[0m`);
      expect(formatCommandMessage('hello')).toBe(`[32mhello[0m`);
      expect(formatInfoMessage('hello')).toBe(`[38;5;37mhello[0m`);
      expect(formatMcpMessage('hello')).toBe(`[38;5;45mhello[0m`);
      expect(formatCustomToolMessage('hello')).toBe(`[38;5;163mhello[0m`);
      expect(formatUsageMessage('hello')).toBe(`[38;5;208mhello[0m`);
      expect(formatFinalUsageMessage('hello')).toBe(`[38;5;33mhello[0m`);
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

  test('shell display omits ANSI controls when colors are disabled', () => {
    const original = process.stdout.write;
    const writes = [];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    try {
      setTerminalOutputOptions({ colors: false });
      clearTerminal();
      expect(formatPromptForCwd('/tmp')).not.toContain('\u001b[');
    } finally {
      setTerminalOutputOptions({ colors: true });
      process.stdout.write = original;
    }
  });
});
