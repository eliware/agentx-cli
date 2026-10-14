import { EventEmitter } from "node:events";
import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { executeLocalShellCommand } from "../../src/agent/local-shell.mjs";

describe("local shell interaction", () => {
  let input;

  afterEach(() => {
    input = null;
  });

  test("runs a real noninteractive command without changing terminal state", async () => {
    const preserveHistory = jest.fn();
    const replaceReadline = jest.fn();
    const result = await executeLocalShellCommand({
      command: 'node -e "process.exit(0)"',
      cwd: ".",
      input: { isTTY: false, setRawMode: jest.fn(), on: jest.fn() },
      preserveHistory,
      replaceReadline,
    });
    expect(result.outcome.exit_code).toBe(0);
    expect(preserveHistory).not.toHaveBeenCalled();
    expect(replaceReadline).not.toHaveBeenCalled();
  });

  test("restores readline and cooked mode after an interactive command", async () => {
    input = Object.assign(new EventEmitter(), {
      isTTY: true,
      setRawMode: jest.fn(),
      resume: jest.fn(),
    });
    const readline = { close: jest.fn() };
    const preserveHistory = jest.fn();
    const replaceReadline = jest.fn();
    const execute = jest.fn(async () => {
      input.emit("data", "ordinary input");
      return "output";
    });
    await executeLocalShellCommand({
      command: "dir",
      cwd: ".",
      input,
      readline,
      preserveHistory,
      replaceReadline,
      execute,
    });
    expect(execute).toHaveBeenCalledWith("dir", ".", {
      signal: expect.objectContaining({ aborted: false }),
    });
    expect(preserveHistory).toHaveBeenCalledTimes(1);
    expect(readline.close).toHaveBeenCalledTimes(1);
    expect(input.setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(input.listenerCount("data")).toBe(0);
    expect(replaceReadline).toHaveBeenCalledTimes(1);
  });

  test("aborts on Ctrl-C and reports the interrupted command", async () => {
    input = Object.assign(new EventEmitter(), {
      isTTY: true,
      setRawMode: jest.fn(),
      resume: jest.fn(),
    });
    let commandSignal;
    const execute = jest.fn(async (_command, _cwd, { signal }) => {
      commandSignal = signal;
      input.emit("data", "\x03");
      return "partial";
    });
    const reportInterruption = jest.fn();
    await executeLocalShellCommand({
      command: "long-running",
      cwd: ".",
      input,
      execute,
      reportInterruption,
    });
    expect(commandSignal.aborted).toBe(true);
    expect(reportInterruption).toHaveBeenCalledTimes(1);
    expect(input.listenerCount("data")).toBe(0);
  });

  test("allows interruption without an optional reporting callback", async () => {
    input = Object.assign(new EventEmitter(), {
      isTTY: true,
      setRawMode: jest.fn(),
      resume: jest.fn(),
    });
    await executeLocalShellCommand({
      command: "optional-callback",
      cwd: ".",
      input,
      execute: async () => {
        input.emit("data", "\x03");
      },
    });
    expect(input.listenerCount("data")).toBe(0);
  });

  test("restores terminal state when command execution rejects", async () => {
    input = Object.assign(new EventEmitter(), {
      isTTY: true,
      setRawMode: jest.fn(),
      resume: jest.fn(),
    });
    const error = new Error("execution failed");
    const replaceReadline = jest.fn();
    await expect(
      executeLocalShellCommand({
        command: "fail",
        cwd: ".",
        input,
        execute: jest.fn().mockRejectedValue(error),
        replaceReadline,
      }),
    ).rejects.toBe(error);
    expect(input.setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(input.listenerCount("data")).toBe(0);
    expect(replaceReadline).toHaveBeenCalledTimes(1);
  });
});
