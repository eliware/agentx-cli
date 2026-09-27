import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const executeShellCommand = jest.fn();
await jest.unstable_mockModule("../src/tool-shell.mjs", () => ({ executeShellCommand }));
const { runShellCommandSequence, runShellCommands } =
  await import("../src/tool-shell-sequence.mjs");

describe("shell command sequencing", () => {
  beforeEach(() => executeShellCommand.mockReset());

  test("normalizes command lists and executes them sequentially with aggregate metadata", async () => {
    executeShellCommand
      .mockResolvedValueOnce({ stdout: "one", outcome: { type: "exit", exit_code: 0 } })
      .mockResolvedValueOnce({ stdout: "two", outcome: { type: "exit", exit_code: 0 } });
    const result = await runShellCommands(["one", null], "/work", {
      callId: "call-1",
      timeoutMs: 100,
      maxOutputLength: 10,
    });
    expect(executeShellCommand.mock.calls.map(([command]) => command)).toEqual(["one", ""]);
    expect(executeShellCommand).toHaveBeenNthCalledWith(
      1,
      "one",
      "/work",
      expect.objectContaining({ timeoutMs: 100, maxOutputLength: 10 }),
    );
    expect(result).toMatchObject({
      type: "shell_call_output",
      call_id: "call-1",
      status: "completed",
      output: [{ stdout: "one" }, { stdout: "two" }],
      max_output_length: 10,
    });
  });

  test("normalizes a single command and ignores unsupported command shapes", async () => {
    executeShellCommand.mockResolvedValue({ stdout: "ok" });
    await runShellCommands("single", "/work");
    expect(executeShellCommand).toHaveBeenCalledWith(
      "single",
      "/work",
      expect.objectContaining({ timeoutMs: null, maxOutputLength: null }),
    );
    executeShellCommand.mockClear();
    await expect(runShellCommands({ command: "not a list" }, "/work")).resolves.toMatchObject({
      call_id: "",
      status: "completed",
      output: [],
      max_output_length: null,
    });
    expect(executeShellCommand).not.toHaveBeenCalled();
  });

  test("normalizes explicit steps and stops after a timed-out command", async () => {
    const signal = new AbortController().signal;
    executeShellCommand
      .mockResolvedValueOnce({ outcome: { type: "exit", exit_code: 1 } })
      .mockResolvedValueOnce({ outcome: { type: "timeout" } });
    const result = await runShellCommandSequence(
      [
        { command: 7, cwd: null, timeoutMs: 30, maxOutputLength: 8 },
        { command: "later", cwd: "/other", maxOutputLength: 14 },
        { command: "unreached" },
      ],
      { defaultCwd: "/default", signal },
    );
    expect(executeShellCommand).toHaveBeenNthCalledWith(1, "7", "/default", {
      timeoutMs: 30,
      maxOutputLength: 8,
      signal,
    });
    expect(executeShellCommand).toHaveBeenNthCalledWith(2, "later", "/other", {
      timeoutMs: null,
      maxOutputLength: 14,
      signal,
    });
    expect(executeShellCommand).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "incomplete", max_output_length: 14 });
  });

  test("returns an empty completed result for non-array steps", async () => {
    await expect(runShellCommandSequence(null)).resolves.toMatchObject({
      type: "shell_call_output",
      call_id: "",
      status: "completed",
      output: [],
      max_output_length: null,
    });
  });

  test("normalizes missing step fields and ignores unusable output limits", async () => {
    executeShellCommand.mockResolvedValue({ outcome: { type: "exit", exit_code: 0 } });
    const result = await runShellCommandSequence([
      null,
      { command: "x", cwd: 12, maxOutputLength: "bad" },
    ]);
    expect(executeShellCommand).toHaveBeenNthCalledWith(1, "", "", {
      timeoutMs: null,
      maxOutputLength: null,
      signal: undefined,
    });
    expect(executeShellCommand).toHaveBeenNthCalledWith(2, "x", "12", {
      timeoutMs: null,
      maxOutputLength: "bad",
      signal: undefined,
    });
    expect(result.max_output_length).toBeNull();
    await runShellCommands();
    expect(executeShellCommand).toHaveBeenCalledTimes(2);
  });

  test("normalizes explicit null command and default working directory values", async () => {
    executeShellCommand.mockResolvedValue({ outcome: { type: "exit", exit_code: 0 } });
    const result = await runShellCommandSequence([{ command: null, cwd: null }], {
      defaultCwd: null,
    });

    expect(executeShellCommand).toHaveBeenCalledWith("", "", {
      timeoutMs: null,
      maxOutputLength: null,
      signal: undefined,
    });
    expect(result.output).toHaveLength(1);
  });
});
