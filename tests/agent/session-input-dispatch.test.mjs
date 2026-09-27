import { describe, expect, jest, test } from "@jest/globals";
import { dispatchSessionInput } from "../../src/agent/session-input-dispatch.mjs";

describe("session input dispatcher", () => {
  test("ignores whitespace-only input", async () => {
    const deps = { executeLocalShellCommand: jest.fn() };
    await expect(dispatchSessionInput({ message: "  \n", state: {}, deps })).resolves.toEqual({
      action: "continue",
    });
    expect(deps.executeLocalShellCommand).not.toHaveBeenCalled();
  });

  test("runs local commands, persists transcript, and continues", async () => {
    const state = { pendingCliTranscript: "earlier" };
    const deps = {
      executeLocalShellCommand: jest.fn(async ({ reportInterruption }) => {
        reportInterruption();
        return { stdout: "ok" };
      }),
      appendCliTranscript: jest.fn(() => "updated"),
      saveState: jest.fn(async () => {}),
      writeSystem: jest.fn(),
      preserveHistory: jest.fn(),
      replaceReadline: jest.fn(),
    };

    await expect(
      dispatchSessionInput({
        message: "  ! npm test ",
        cwd: "C:/repo",
        input: { isTTY: true },
        readline: { id: "rl" },
        oneShot: false,
        state,
        deps,
      }),
    ).resolves.toEqual({ action: "continue" });
    expect(deps.executeLocalShellCommand).toHaveBeenCalledWith(
      expect.objectContaining({ command: "npm test", cwd: "C:/repo", input: { isTTY: true } }),
    );
    expect(deps.appendCliTranscript).toHaveBeenCalledWith("earlier", "npm test", { stdout: "ok" });
    expect(deps.writeSystem).toHaveBeenCalledWith("User interrupted command (Ctrl-C)");
    expect(state.pendingCliTranscript).toBe("updated");
    expect(deps.saveState).toHaveBeenCalledTimes(1);
  });

  test("ignores a local-command prefix without a command", async () => {
    const executeLocalShellCommand = jest.fn();
    await expect(
      dispatchSessionInput({
        message: "!   ",
        oneShot: false,
        state: {},
        deps: { executeLocalShellCommand },
      }),
    ).resolves.toEqual({ action: "continue" });
    expect(executeLocalShellCommand).not.toHaveBeenCalled();
  });

  test("discards local commands in one-shot mode when selecting stdin", async () => {
    const executeLocalShellCommand = jest.fn(async () => ({ stdout: "done" }));
    await dispatchSessionInput({
      message: "! echo done",
      cwd: ".",
      input: {},
      oneShot: true,
      state: { pendingCliTranscript: "" },
      deps: {
        executeLocalShellCommand,
        appendCliTranscript: () => "",
        saveState: jest.fn(),
        writeSystem: jest.fn(),
        preserveHistory: jest.fn(),
        replaceReadline: jest.fn(),
      },
    });
    expect(executeLocalShellCommand).toHaveBeenCalledWith(expect.objectContaining({ input: null }));
  });

  test("returns ordinary task text to the model request path", async () => {
    const dispatchCommand = jest.fn(async (message) => ({ action: "request", message }));
    await expect(
      dispatchSessionInput({
        message: "  explain this  ",
        state: {},
        deps: { dispatchCommand },
      }),
    ).resolves.toEqual({ action: "request", message: "explain this" });
    expect(dispatchCommand).toHaveBeenCalledWith("explain this");
  });
});
