import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import path from "node:path";

describe("entrypoint", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("agentx.mjs loads .agentx from the user home directory", async () => {
    const config = jest.fn();

    await jest.unstable_mockModule("../src/env-loader.mjs", () => ({
      loadUserConfiguration: (configPath, options) =>
        config({ path: configPath, quiet: true, ...options }),
    }));
    await jest.unstable_mockModule("../src/runtime.mjs", () => ({
      isDirectInvocation: () => false,
      promptPath: "/tmp/prompt.json",
    }));
    const runAgent = jest.fn();
    await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

    await import("../src/agent-entrypoint.mjs");

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({
      path: path.join(process.env.HOME || process.env.USERPROFILE || "", ".agentx"),
      quiet: true,
    });
  });
  test("maps the legacy model name before it starts a message session", async () => {
    const oldModel = process.env.AGENTX_MODEL;
    const oldArgv = process.argv;
    process.env.AGENTX_MODEL = "gpt-5.6-luna";
    process.argv = [process.argv[0], process.argv[1], "hello"];
    try {
      await jest.unstable_mockModule("../src/env-loader.mjs", () => ({
        loadUserConfiguration: jest.fn(),
      }));
      await jest.unstable_mockModule("../src/setup-env.mjs", () => ({
        readEnvState: async () => ({}),
      }));
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn().mockResolvedValue(undefined);
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));
      await import("../src/agent-entrypoint.mjs");
      expect(process.env.AGENTX_MODEL).toBe("gpt-6-luna");
      expect(runAgent).toHaveBeenCalledWith(
        expect.objectContaining({ initialMessage: "hello", oneShot: true }),
      );
    } finally {
      if (oldModel === undefined) delete process.env.AGENTX_MODEL;
      else process.env.AGENTX_MODEL = oldModel;
      process.argv = oldArgv;
    }
  });
  test("agentx.mjs does not start the REPL when invoked indirectly", async () => {
    await jest.unstable_mockModule("../src/runtime.mjs", () => ({
      isDirectInvocation: () => false,
      promptPath: "/tmp/prompt.json",
    }));
    const runAgent = jest.fn();
    await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({
      runAgent,
    }));

    await import("../src/agent-entrypoint.mjs");

    expect(runAgent).not.toHaveBeenCalled();
  });
});
