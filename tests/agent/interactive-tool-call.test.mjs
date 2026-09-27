import { EventEmitter } from "node:events";
import { afterEach, describe, expect, jest, test } from "@jest/globals";

const defaultRunToolCall = jest.fn();
jest.unstable_mockModule("../../src/tool-dispatch.mjs", () => ({
  runToolCall: defaultRunToolCall,
}));

const { createInteractiveToolCallRunner } =
  await import("../../src/agent/interactive-tool-call.mjs");

function makeInput({ isTTY = true, rawMode = true, events = true } = {}) {
  const input = new EventEmitter();
  input.isTTY = isTTY;
  if (rawMode) input.setRawMode = jest.fn();
  if (!events) input.on = undefined;
  input.resume = jest.fn();
  return input;
}

function makeRunner({ input, oneShot = false, runToolCall, write = jest.fn(), ...overrides }) {
  const lifecycle = {
    preserveHistory: jest.fn(),
    closeReadline: jest.fn(),
    replaceReadline: jest.fn(),
  };
  const runner = createInteractiveToolCallRunner({
    oneShot,
    terminalInput: input,
    ...lifecycle,
    write,
    formatMessage: (message) => `[${message}]`,
    loadToolCall: async () => ({ runToolCall }),
    ...overrides,
  });
  return { runner, lifecycle, write };
}

afterEach(() => {
  defaultRunToolCall.mockReset();
});

describe("interactive model tool execution", () => {
  test("runs noninteractive/one-shot calls without terminal changes and applies env permission", async () => {
    const input = makeInput();
    const originalPermission = process.env.AGENTX_PERMISSION;
    process.env.AGENTX_PERMISSION = "read";
    const output = { type: "shell_call_output", output: [] };
    const runToolCall = jest.fn().mockResolvedValue(output);
    const { runner, lifecycle } = makeRunner({ input, oneShot: true, runToolCall });
    try {
      await expect(runner({ id: "call" }, ".", {})).resolves.toBe(output);
      expect(runToolCall).toHaveBeenCalledWith(
        { id: "call" },
        ".",
        expect.objectContaining({ permission: "read", signal: expect.any(AbortSignal) }),
      );
      expect(runToolCall.mock.calls[0][2].signal.aborted).toBe(false);
      expect(input.setRawMode).not.toHaveBeenCalled();
      expect(input.listenerCount("data")).toBe(0);
      expect(lifecycle.preserveHistory).not.toHaveBeenCalled();
      expect(lifecycle.closeReadline).not.toHaveBeenCalled();
      expect(lifecycle.replaceReadline).not.toHaveBeenCalled();
    } finally {
      if (originalPermission === undefined) delete process.env.AGENTX_PERMISSION;
      else process.env.AGENTX_PERMISSION = originalPermission;
    }
  });

  test("handles Ctrl-T, annotates shell output, and restores readline/raw mode", async () => {
    const input = makeInput();
    const statusController = { pause: jest.fn() };
    let toolOptions;
    const runToolCall = jest.fn(async (_call, _cwd, options) => {
      toolOptions = options;
      input.emit("data", "ordinary input");
      input.emit("data", "\x14");
      return { type: "shell_call_output", output: [{ stderr: "partial output" }] };
    });
    const { runner, lifecycle, write } = makeRunner({ input, runToolCall });
    const result = await runner({ id: "interrupt" }, "C:\\work", {
      statusController,
      permission: "write",
    });
    expect(result.output[0].stderr).toContain(
      "partial output\nThe user requested interruption (Ctrl-T)",
    );
    expect(result.output[0].stderr).toContain("do not retry or run additional commands");
    expect(toolOptions.permission).toBe("write");
    expect(toolOptions.signal.aborted).toBe(true);
    expect(statusController.pause).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("[User interrupted command (Ctrl-T)]\n");
    expect(lifecycle.preserveHistory).toHaveBeenCalledTimes(1);
    expect(lifecycle.closeReadline).toHaveBeenCalledTimes(1);
    expect(lifecycle.replaceReadline).toHaveBeenCalledTimes(1);
    expect(input.setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(input.listenerCount("data")).toBe(0);
  });

  test("leaves interrupted non-shell results unchanged and tolerates no first output item", async () => {
    const input = makeInput();
    const outputs = [{ type: "function_call_output", output: [] }, { type: "shell_call_output" }];
    let current = 0;
    const runToolCall = jest.fn(async () => {
      input.emit("data", "\x14");
      return outputs[current++];
    });
    const { runner, write } = makeRunner({ input, runToolCall });
    await expect(runner({}, ".")).resolves.toBe(outputs[0]);
    await expect(runner({}, ".")).resolves.toBe(outputs[1]);
    expect(write).toHaveBeenCalledTimes(2);
    expect(outputs[1]).toEqual({ type: "shell_call_output" });
  });

  test("restores interactive terminal state when tool execution rejects", async () => {
    const input = makeInput();
    const runToolCall = jest.fn().mockRejectedValue(new Error("tool failed"));
    const { runner, lifecycle } = makeRunner({ input, runToolCall });
    await expect(runner({}, ".")).rejects.toThrow("tool failed");
    expect(input.setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(input.listenerCount("data")).toBe(0);
    expect(lifecycle.replaceReadline).toHaveBeenCalledTimes(1);
  });

  test("uses default tool loading and terminal formatting", async () => {
    const input = makeInput();
    const originalWrite = process.stdout.write;
    const writes = [];
    process.stdout.write = (value) => {
      writes.push(String(value));
      return true;
    };
    defaultRunToolCall.mockImplementation(async () => {
      input.emit("data", "\x14");
      return { type: "shell_call_output", output: [{ stderr: "" }] };
    });
    const runner = createInteractiveToolCallRunner({
      terminalInput: input,
      preserveHistory: jest.fn(),
      closeReadline: jest.fn(),
      replaceReadline: jest.fn(),
    });
    try {
      const result = await runner({}, ".");
      expect(defaultRunToolCall).toHaveBeenCalledTimes(1);
      expect(defaultRunToolCall.mock.calls[0][2].permission).toBe("execute");
      expect(result.output[0].stderr).toContain("The user requested interruption");
      expect(writes.join("")).toContain("User interrupted command (Ctrl-T)");
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  test("does not enter interactive mode without a TTY raw input interface", async () => {
    const input = makeInput({ rawMode: false });
    const runToolCall = jest.fn().mockResolvedValue({ type: "other" });
    const { runner, lifecycle } = makeRunner({ input, runToolCall });
    await runner({}, ".");
    expect(lifecycle.preserveHistory).not.toHaveBeenCalled();
    expect(lifecycle.closeReadline).not.toHaveBeenCalled();
    expect(lifecycle.replaceReadline).not.toHaveBeenCalled();
  });
});
