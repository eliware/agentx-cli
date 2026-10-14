import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { getPackageVersion } from "../src/cli-version.mjs";
const packageVersion = getPackageVersion();

describe("entrypoint", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("agentx.mjs prints quick help and exits for help flags", async () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    process.argv = [...process.argv, "--help"];

    try {
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join("")).toContain("Usage: agentx [flags] [message...]");
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
    }
  });
  test("agentx.mjs prints the package version and exits for version flags", async () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    process.argv = [...process.argv, "--version"];

    try {
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join("")).toContain(packageVersion);
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
    }
  });
});
