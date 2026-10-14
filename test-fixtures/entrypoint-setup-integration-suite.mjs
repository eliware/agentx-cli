import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import * as realFs from "node:fs";

describe("entrypoint", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("agentx.mjs exercises successful interactive setup", async () => {
    const oldEnv = process.env.NODE_ENV;
    const oldIn = process.stdin.isTTY;
    const oldOut = process.stdout.isTTY;
    const oldArgv = process.argv;
    process.argv = [process.argv[0], process.argv[1]];
    const oldKey = process.env.agentx_api_key;
    process.env.NODE_ENV = "";
    delete process.env.agentx_api_key;
    delete process.env.AGENTX_API_KEY;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    try {
      const rl = { question: jest.fn().mockResolvedValue("yes"), close: jest.fn() };
      const envPath = "/tmp/.agentx-test";
      await jest.unstable_mockModule("node:readline/promises", () => ({
        createInterface: () => rl,
      }));
      await jest.unstable_mockModule("node:fs", () => ({
        ...realFs,
        existsSync: (file) => file === envPath,
      }));
      await jest.unstable_mockModule("../src/platform.mjs", () => ({ getHomeDirectory: () => "" }));
      await jest.unstable_mockModule("dotenv", () => ({
        config: jest.fn(({ override }) => {
          if (override) process.env.agentx_api_key = "configured";
        }),
      }));
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn().mockResolvedValue(undefined);
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));
      const runSetup = jest.fn().mockResolvedValue(undefined);
      await jest.unstable_mockModule("../src/setup.mjs", () => ({
        runSetup,
      }));
      await jest.unstable_mockModule("../src/setup-env.mjs", () => ({
        readEnvState: jest.fn().mockResolvedValue({ values: {} }),
      }));
      await jest.unstable_mockModule("../src/setup-paths.mjs", () => ({
        setupPaths: { envPath },
      }));
      await import("../src/agent-entrypoint.mjs");
      expect(runSetup).toHaveBeenCalled();
      expect(runAgent).toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldEnv;
      if (oldKey === undefined) delete process.env.agentx_api_key;
      else process.env.agentx_api_key = oldKey;
      Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: oldIn });
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: oldOut });
      process.argv = oldArgv;
    }
  });

  test("agentx.mjs skips setup when configuration and an API key exist", async () => {
    const oldEnv = process.env.NODE_ENV;
    const oldKey = process.env.agentx_api_key;
    const oldIn = process.stdin.isTTY;
    const oldOut = process.stdout.isTTY;
    const oldArgv = process.argv;
    process.env.NODE_ENV = "";
    process.env.agentx_api_key = "configured";
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    process.argv = [process.argv[0], process.argv[1]];
    try {
      const ask = jest.fn().mockResolvedValue("yes");
      await jest.unstable_mockModule("node:readline/promises", () => ({
        createInterface: () => ({ question: ask, close: jest.fn() }),
      }));
      await jest.unstable_mockModule("node:fs", () => ({ ...realFs, existsSync: () => true }));
      await jest.unstable_mockModule("../src/platform.mjs", () => ({
        getHomeDirectory: () => "/tmp/home",
      }));
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "",
      }));
      const runAgent = jest.fn().mockResolvedValue(undefined);
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));
      await import("../src/agent-entrypoint.mjs");
      expect(ask).not.toHaveBeenCalled();
      expect(runAgent).toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldEnv;
      if (oldKey === undefined) delete process.env.agentx_api_key;
      else process.env.agentx_api_key = oldKey;
      Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: oldIn });
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: oldOut });
      process.argv = oldArgv;
    }
  });
});
