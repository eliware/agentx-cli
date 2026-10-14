import { beforeEach, describe, expect, jest, test } from "@jest/globals";

describe("entrypoint", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("agentx.mjs sends positional text as one-shot input", async () => {
    await jest.unstable_mockModule("../src/runtime.mjs", () => ({
      isDirectInvocation: () => true,
      promptPath: "/tmp/prompt.json",
    }));
    const runAgent = jest.fn().mockResolvedValue(undefined);
    await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));
    process.argv = [process.argv[0], process.argv[1], "hello", "world"];
    await import("../src/agent-entrypoint.mjs");
    expect(runAgent).toHaveBeenCalledWith({
      promptPath: "/tmp/prompt.json",
      cwd: process.cwd(),
      flags: expect.any(Object),
      initialMessage: "hello world",
      oneShot: true,
    });
  });
  test("agentx.mjs starts the REPL when invoked directly", async () => {
    await jest.unstable_mockModule("../src/runtime.mjs", () => ({
      isDirectInvocation: () => true,
      promptPath: "/tmp/prompt.json",
    }));
    const runAgent = jest.fn().mockResolvedValue(undefined);
    await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({
      runAgent,
    }));
    process.argv = [process.argv[0], process.argv[1]];

    await import("../src/agent-entrypoint.mjs");

    expect(runAgent).toHaveBeenCalledWith({
      promptPath: "/tmp/prompt.json",
      cwd: process.cwd(),
      flags: expect.any(Object),
    });
  });
});
