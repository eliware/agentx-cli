import { describe, expect, jest, test } from "@jest/globals";
import { bootstrapAgentEntrypoint } from "../src/agent-entrypoint-bootstrap.mjs";

function setup(overrides = {}) {
  const processRef = {
    argv: ["node", "agentx"],
    env: {},
    stdout: { write: jest.fn() },
    stderr: { write: jest.fn() },
    cwd: () => "/repo",
    exitCode: 0,
  };
  const dependencies = {
    isDirectInvocation: jest.fn(() => true),
    promptPath: "prompt.json",
    parseCliArgs: jest.fn(() => ({ flags: {}, messageArgs: [] })),
    runEntrypointAction: jest.fn(() => false),
    prepareAgentStartup: jest.fn(async () => ({ cwd: "/repo", messageArgs: [] })),
    readEnvState: jest.fn(),
    runEntrypointSetup: jest.fn(),
    runAgent: jest.fn(),
    ...overrides,
  };
  return { processRef, dependencies };
}

describe("entrypoint bootstrap", () => {
  test("uses process defaults when the caller omits them", async () => {
    await bootstrapAgentEntrypoint();
  });

  test("does not start when another module imports the entrypoint", async () => {
    const { processRef, dependencies } = setup();
    dependencies.isDirectInvocation.mockReturnValue(false);
    await bootstrapAgentEntrypoint({
      moduleUrl: "agent-entrypoint.mjs",
      processRef,
      dependencies,
    });
    expect(dependencies.parseCliArgs).not.toHaveBeenCalled();
  });

  test("stops after an entrypoint action handles the arguments", async () => {
    const { processRef, dependencies } = setup();
    dependencies.runEntrypointAction.mockReturnValue(true);
    await bootstrapAgentEntrypoint({ argv: ["--help"], processRef, dependencies });
    expect(dependencies.prepareAgentStartup).not.toHaveBeenCalled();
    expect(dependencies.runAgent).not.toHaveBeenCalled();
  });

  test("runs setup before starting an interactive session", async () => {
    const { processRef, dependencies } = setup();
    const events = [];
    dependencies.runEntrypointSetup.mockImplementation(async () => events.push("setup"));
    dependencies.runAgent.mockImplementation(async () => events.push("agent"));
    await bootstrapAgentEntrypoint({ homeDirectory: "home", processRef, dependencies });
    expect(events).toEqual(["setup", "agent"]);
    expect(dependencies.prepareAgentStartup).toHaveBeenCalledWith(
      { flags: {}, messageArgs: [] },
      expect.objectContaining({ env: processRef.env, cwd: "/repo" }),
    );
  });

  test("sends positional text as one-shot input without setup", async () => {
    const { processRef, dependencies } = setup({
      prepareAgentStartup: jest.fn(async () => ({ cwd: "/work", messageArgs: ["do", "work"] })),
    });
    await bootstrapAgentEntrypoint({ processRef, dependencies });
    expect(dependencies.runEntrypointSetup).not.toHaveBeenCalled();
    expect(dependencies.runAgent).toHaveBeenCalledWith({
      promptPath: "prompt.json",
      cwd: "/work",
      flags: {},
      initialMessage: "do work",
      oneShot: true,
    });
  });

  test("prints startup errors and sets a failure code", async () => {
    const { processRef, dependencies } = setup({
      prepareAgentStartup: jest.fn(async () => {
        throw new Error("startup failed");
      }),
    });
    await bootstrapAgentEntrypoint({ processRef, dependencies });
    expect(processRef.stderr.write).toHaveBeenCalledWith("startup failed\n");
    expect(processRef.exitCode).toBe(1);
  });
});
