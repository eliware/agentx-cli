import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import path from "node:path";

describe("entrypoint", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("agentx.mjs rejects a missing cwd value", async () => {
    const writes = [];
    const originalErrWrite = process.stderr.write;
    const originalExitCode = process.exitCode;
    const originalArgv = [...process.argv];
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exitCode = undefined;
    process.argv = [...process.argv, "--cwd"];

    try {
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join("")).toContain("--cwd requires a path");
      expect(process.exitCode).toBe(1);
    } finally {
      process.stderr.write = originalErrWrite;
      process.exitCode = originalExitCode;
      process.argv = originalArgv;
    }
  });
  test("agentx.mjs resolves an explicit cwd for one-shot messages", async () => {
    const originalArgv = [...process.argv];
    process.argv = [process.argv[0], process.argv[1], "--cwd", "/tmp", "show", "cwd"];

    try {
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn().mockResolvedValue(undefined);
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).toHaveBeenCalledWith({
        promptPath: "/tmp/prompt.json",
        cwd: path.resolve(process.cwd(), "/tmp"),
        flags: expect.any(Object),
        initialMessage: "show cwd",
        oneShot: true,
      });
    } finally {
      process.argv = originalArgv;
    }
  });
});
