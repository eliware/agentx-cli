import { describe, expect, test } from "@jest/globals";
import "../test-fixtures/jest-setup.mjs";
import {
  clearTerminal,
  formatCommandMessage,
  formatCustomToolMessage,
  formatInfoMessage,
  formatMcpMessage,
  formatPromptForCwd,
  formatSystemMessage,
  formatUsageMessage,
  formatFinalUsageMessage,
  formatWhiteMessage,
} from "../src/shell-display.mjs";
import { setTerminalOutputOptions } from "../src/terminal-output.mjs";

describe("shell display", () => {
  test("formats prompt and messages and clears the terminal", () => {
    const writes = [];
    const originalUser = process.env.USER;
    const originalUsername = process.env.USERNAME;
    const originalHost = process.env.HOSTNAME;
    const originalComputer = process.env.COMPUTERNAME;

    try {
      process.env.USER = "alice";
      process.env.HOSTNAME = "laptop";
      delete process.env.USERNAME;
      delete process.env.COMPUTERNAME;

      expect(formatPromptForCwd("/tmp/work")).toBe(
        `[38;5;37malice@laptop:/tmp/work[38;5;255m#[0m[38;5;255m `,
      );
      expect(formatSystemMessage("hello")).toBe(`[38;5;160mhello[0m`);
      expect(formatCommandMessage("hello")).toBe(`[32mhello[0m`);
      expect(formatInfoMessage("hello")).toBe(`[38;5;37mhello[0m`);
      expect(formatMcpMessage("hello")).toBe(`[38;5;45mhello[0m`);
      expect(formatCustomToolMessage("hello")).toBe(`[38;5;163mhello[0m`);
      expect(formatUsageMessage("hello")).toBe(`[38;5;208mhello[0m`);
      expect(formatFinalUsageMessage("hello")).toBe(`[38;5;33mhello[0m`);
      expect(formatWhiteMessage("hello")).toBe("\u001b[38;5;255mhello\u001b[0m");
      clearTerminal({ isTTY: false, write: (chunk) => writes.push(String(chunk)) });
      expect(writes).toContain("\n");

      writes.length = 0;
      clearTerminal({ isTTY: true, write: (chunk) => writes.push(String(chunk)) });
      expect(writes).toContain("\x1b[2J\x1b[H");

      setTerminalOutputOptions({ colors: false });
      writes.length = 0;
      clearTerminal({ isTTY: true, write: (chunk) => writes.push(String(chunk)) });
      expect(writes).toContain("\n");
      clearTerminal();
      expect(formatPromptForCwd("/tmp")).not.toContain("\u001b[");
    } finally {
      setTerminalOutputOptions({ colors: true });
      if (originalUser === undefined) delete process.env.USER;
      else process.env.USER = originalUser;
      if (originalUsername === undefined) delete process.env.USERNAME;
      else process.env.USERNAME = originalUsername;
      if (originalHost === undefined) delete process.env.HOSTNAME;
      else process.env.HOSTNAME = originalHost;
      if (originalComputer === undefined) delete process.env.COMPUTERNAME;
      else process.env.COMPUTERNAME = originalComputer;
    }
  });
});
