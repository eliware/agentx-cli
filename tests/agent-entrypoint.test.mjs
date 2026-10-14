import { describe, expect, jest, test } from "@jest/globals";
async function invokeDirectEntryPoint(args, runAgent, setupPrompt = null) {
  jest.resetModules();
  const originalArgv = process.argv;
  process.argv = [process.argv[0], process.argv[1], ...args];
  await jest.unstable_mockModule("../src/runtime.mjs", () => ({
    isDirectInvocation: () => true,
    promptPath: "/tmp/prompt.json",
  }));
  await jest.unstable_mockModule("../src/agent-entrypoint-env.mjs", () => ({
    loadEntrypointEnvironment: () => null,
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
      runEntrypointSetup: jest.fn(async () => false),
    }));
  }
  try {
    await import("../src/agent-entrypoint.mjs");
  } finally {
    process.argv = originalArgv;
  }
}

describe("entrypoint", () => {
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
      expect(readline.question).toHaveBeenCalledTimes(1);
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
});
