import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { getPackageVersion } from "../src/cli-version.mjs";
const packageVersion = getPackageVersion();

async function invokeDirectEntryPoint(args, runAgent, setupPrompt = null, options = {}) {
  jest.resetModules();
  const originalArgv = process.argv;
  process.argv = [process.argv[0], process.argv[1], ...args];
  await jest.unstable_mockModule("../src/runtime.mjs", () => ({
    isDirectInvocation: () => true,
    promptPath: "/tmp/prompt.json",
  }));
  await jest.unstable_mockModule("../src/agent-entrypoint-env.mjs", () => ({
    loadEntrypointEnvironment: () => options.homeDirectory ?? null,
  }));
  if (options.configured)
    await jest.unstable_mockModule("node:fs", () => ({
      ...jest.requireActual("node:fs"),
      default: jest.requireActual("node:fs"),
      existsSync: () => true,
    }));
  await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));
  await jest.unstable_mockModule("../src/env-loader.mjs", () => ({
    loadUserConfiguration: jest.fn(),
  }));
  await jest.unstable_mockModule("../src/setup-env.mjs", () => ({
    readEnvState: jest.fn(async () => ({})),
  }));
  if (setupPrompt) {
    await jest.unstable_unmockModule("../src/agent-entrypoint-setup.mjs");
    await jest.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => setupPrompt,
    }));
    await jest.unstable_mockModule("../src/setup.mjs", () => ({ runSetup: jest.fn() }));
    await jest.unstable_mockModule("../src/setup-paths.mjs", () => ({
      setupPaths: { envPath: "settings.env" },
    }));
  } else {
    await jest.unstable_mockModule("../src/agent-entrypoint-setup.mjs", () => ({
      confirmSetup: jest.fn(async (options) => {
        if (options.configured) options.hasApiKey();
        return false;
      }),
    }));
  }
  try {
    await import("../src/agent-entrypoint.mjs");
  } finally {
    process.argv = originalArgv;
  }
}

describe("entrypoint", () => {
  beforeEach(() => {
    jest.resetModules();
  });
  test("does not start the agent when another module imports the entrypoint", async () => {
    await jest.unstable_mockModule("../src/runtime.mjs", () => ({
      isDirectInvocation: () => false,
      promptPath: "",
    }));
    const runAgent = jest.fn();
    await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));
    await import("../src/agent-entrypoint.mjs");
    expect(runAgent).not.toHaveBeenCalled();
  });
  test.each([
    ["--help", "Usage: agentx [flags] [message...]"],
    ["--version", packageVersion],
  ])("prints action output for %s", async (flag, expected) => {
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    process.argv = [...process.argv, flag];

    try {
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join("")).toContain(expected);
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
    }
  });
  test("sends positional text as one-shot input", async () => {
    const runAgent = jest.fn().mockResolvedValue(undefined);
    await invokeDirectEntryPoint(["hello", "world"], runAgent);
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        promptPath: "/tmp/prompt.json",
        initialMessage: "hello world",
        oneShot: true,
      }),
    );
  });
  test("starts the REPL after the user accepts the setup prompt", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalApiKey = process.env.AGENTX_API_KEY;
    const originalLowerApiKey = process.env.agentx_api_key;
    const originalInputTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const originalOutputTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    const readline = { question: jest.fn(async () => "y"), close: jest.fn() };
    process.env.NODE_ENV = "production";
    delete process.env.AGENTX_API_KEY;
    delete process.env.agentx_api_key;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    try {
      const runAgent = jest.fn().mockResolvedValue(undefined);
      await invokeDirectEntryPoint([], runAgent, readline);
      expect(readline.question).toHaveBeenCalledWith(
        "AgentX is not configured. Run agentx-setup now? [Y/n] ",
      );
      expect(readline.close).toHaveBeenCalled();
      expect(runAgent).toHaveBeenCalled();
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalApiKey === undefined) delete process.env.AGENTX_API_KEY;
      else process.env.AGENTX_API_KEY = originalApiKey;
      if (originalLowerApiKey === undefined) delete process.env.agentx_api_key;
      else process.env.agentx_api_key = originalLowerApiKey;
      if (originalInputTTY) Object.defineProperty(process.stdin, "isTTY", originalInputTTY);
      else delete process.stdin.isTTY;
      if (originalOutputTTY) Object.defineProperty(process.stdout, "isTTY", originalOutputTTY);
      else delete process.stdout.isTTY;
    }
  });

  test("prints startup errors and sets a failure code", async () => {
    const oldKey = process.env.agentx_api_key;
    const oldUpperKey = process.env.AGENTX_API_KEY;
    process.env.agentx_api_key = "key";
    delete process.env.AGENTX_API_KEY;
    const runAgent = jest.fn().mockRejectedValue("missing API key");
    const originalWrite = process.stderr.write;
    const originalExitCode = process.exitCode;
    const writes = [];
    process.stderr.write = (text) => (writes.push(String(text)), true);
    process.exitCode = undefined;
    try {
      await invokeDirectEntryPoint([], runAgent, null, {
        homeDirectory: "fake-home",
        configured: true,
      });
      expect(writes.join("")).toContain("missing API key");
      expect(process.exitCode).toBe(1);
    } finally {
      process.stderr.write = originalWrite;
      process.exitCode = originalExitCode;
      if (oldKey === undefined) delete process.env.agentx_api_key;
      else process.env.agentx_api_key = oldKey;
      if (oldUpperKey === undefined) delete process.env.AGENTX_API_KEY;
      else process.env.AGENTX_API_KEY = oldUpperKey;
    }
  });
});
