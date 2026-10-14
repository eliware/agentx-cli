import { beforeEach, describe, expect, jest, test } from "@jest/globals";

describe("entrypoint", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("agentx.mjs prints startup errors and exits non-zero", async () => {
    const writes = [];
    const originalErrWrite = process.stderr.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    const originalExitCode = process.exitCode;
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    process.argv = [process.argv[0], process.argv[1]];

    try {
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn().mockRejectedValue(new Error("missing API key"));
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).toHaveBeenCalledWith({
        promptPath: "/tmp/prompt.json",
        cwd: process.cwd(),
        flags: expect.any(Object),
      });
      expect(writes.join("")).toContain("missing API key");
      expect(process.exitCode).toBe(1);
    } finally {
      process.stderr.write = originalErrWrite;
      process.exit = originalExit;
      process.exitCode = originalExitCode;
      process.argv = originalArgv;
    }
  });
  test("agentx.mjs prints string startup errors using fallback coercion", async () => {
    const writes = [];
    const originalErrWrite = process.stderr.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    const originalExitCode = process.exitCode;
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    process.argv = [...process.argv];

    try {
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn().mockRejectedValue("boom");
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(writes.join("")).toContain("boom");
      expect(process.exitCode).toBe(1);
    } finally {
      process.stderr.write = originalErrWrite;
      process.exit = originalExit;
      process.exitCode = originalExitCode;
      process.argv = originalArgv;
    }
  });
});
