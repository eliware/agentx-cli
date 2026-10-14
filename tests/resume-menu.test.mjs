import { afterEach, beforeEach, describe, expect, jest as testMocks, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import { promptResumeMenu } from "../src/resume-menu.mjs";

function makeIO() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.setRawMode = testMocks.fn();
  input.resume = testMocks.fn();
  const output = { write: testMocks.fn() };
  return { input, output };
}

describe("resume menu", () => {
  test("ignores invalid shortcuts before accepting a numeric shortcut", async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu(
      { response_id: "resp-6" },
      { input, output, forceInteractive: true },
    );
    process.nextTick(() => {
      input.emit("keypress", "5", { name: "5" });
      input.emit("keypress");
      input.emit("keypress", "2", { name: "2" });
    });
    await expect(prompt).resolves.toBe("interrupt-request");
  });

  test("uses default input and output arguments when options are omitted", async () => {
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;

    try {
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
      Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
      await expect(promptResumeMenu({ response_id: "resp-0" })).resolves.toBe("interrupt-retry");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        value: originalStdinIsTTY,
        configurable: true,
      });
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalStdoutIsTTY,
        configurable: true,
      });
    }
  });

  beforeEach(() => {
    testMocks.resetModules();
  });

  afterEach(() => {
    testMocks.restoreAllMocks();
  });

  test("auto-detects interactive mode when test-runner and CI markers are absent", async () => {
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    const originalCi = process.env.CI;
    delete process.env.JEST_WORKER_ID;
    delete process.env.CI;

    const { input, output } = makeIO();
    const prompt = promptResumeMenu({ response_id: "resp-auto" }, { input, output });
    process.nextTick(() => input.emit("keypress", "", { name: "enter" }));

    try {
      await expect(prompt).resolves.toBe("interrupt-retry");
      expect(input.setRawMode).toHaveBeenCalledWith(true);
      expect(
        output.write.mock.calls.some(([chunk]) =>
          String(chunk).includes("Session resp-auto has pending tool calls."),
        ),
      ).toBe(true);
    } finally {
      if (originalJestWorkerId === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = originalJestWorkerId;
      if (originalCi === undefined) delete process.env.CI;
      else process.env.CI = originalCi;
    }
  });

  test("falls back to non-interactive mode when tty support is missing", async () => {
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    const originalCi = process.env.CI;
    delete process.env.JEST_WORKER_ID;
    delete process.env.CI;

    try {
      await expect(
        promptResumeMenu({ response_id: "resp-fallback" }, { input: { isTTY: false }, output: {} }),
      ).resolves.toBe("interrupt-retry");
    } finally {
      if (originalJestWorkerId === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = originalJestWorkerId;
      if (originalCi === undefined) delete process.env.CI;
      else process.env.CI = originalCi;
    }
  });
  test("selects options with number keys", async () => {
    const { input, output } = makeIO();
    input.removeListener = testMocks.fn();
    const prompt = promptResumeMenu(
      { response_id: "resp-1" },
      { input, output, forceInteractive: true },
    );
    process.nextTick(() => {
      input.emit("keypress", "3", { name: "3" });
      input.emit("keypress", "4", { name: "4" });
    });
    await expect(prompt).resolves.toBe("auto-resume");
    expect(input.setRawMode).toHaveBeenCalledWith(true);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(output.write).toHaveBeenCalled();
  });

  test("moves with arrow keys and confirms with enter", async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu(
      { response_id: "resp-2" },
      { input, output, forceInteractive: true },
    );
    process.nextTick(() => {
      input.emit("keypress", "", { name: "down" });
      input.emit("keypress", "", { name: "down" });
      input.emit("keypress", "", { name: "return" });
    });
    await expect(prompt).resolves.toBe("auto-resume");
    expect(
      output.write.mock.calls.some(([chunk]) => String(chunk).includes("\x1b[6A\r\x1b[0J")),
    ).toBe(true);
    expect(
      output.write.mock.calls.some(([chunk]) =>
        String(chunk).includes("Fully auto-resume pending tool execution"),
      ),
    ).toBe(true);
  });

  test("moves up with arrow keys and wraps to the last option", async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu(
      { response_id: "resp-3" },
      { input, output, forceInteractive: true },
    );
    process.nextTick(() => {
      input.emit("keypress", "", { name: "up" });
      input.emit("keypress", "", { name: "enter" });
    });
    await expect(prompt).resolves.toBe("new-session");
    expect(
      output.write.mock.calls.some(([chunk]) => String(chunk).includes("> 4. Start a new session")),
    ).toBe(true);
  });

  test("rejects with AbortError on ctrl-c and restores terminal state", async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu(
      { response_id: "resp-4" },
      { input, output, forceInteractive: true },
    );
    process.nextTick(() => input.emit("keypress", "", { name: "c", ctrl: true }));
    await expect(prompt).rejects.toMatchObject({ name: "AbortError", message: "Interrupted" });
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes("[?25h"))).toBe(true);
  });
});
