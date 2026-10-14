import { expect, jest, test } from "@jest/globals";

const createInteractiveToolCallRunner = jest.fn(() => "interactive runner");
const createAgentRuntimeCommandDispatcher = jest.fn(() => "command dispatcher");
await jest.unstable_mockModule("../../src/agent/interactive-tool-call.mjs", () => ({
  createInteractiveToolCallRunner,
}));
await jest.unstable_mockModule("../../src/agent-runtime-command-dispatch.mjs", () => ({
  createAgentRuntimeCommandDispatcher,
}));

const { createAgentRuntimeCommandServices } =
  await import("../../src/agent/runtime-command-services.mjs");

test("connects command and interactive tool services to runtime options", async () => {
  const repl = {
    preserveHistory: jest.fn(),
    close: jest.fn(),
    replace: jest.fn(),
  };
  const options = {
    oneShot: true,
    terminalInput: {},
    repl,
    runtimeState: {},
    promptPath: "prompt.json",
    outputFlags: {},
    terminalOutput: {},
    statePath: "state.json",
    checkpointPath: "checkpoint.json",
    getCwd: jest.fn(),
    setCwd: jest.fn(),
    saveState: jest.fn(),
    exitWithSummary: jest.fn(),
    resetState: jest.fn(),
    applyRollback: jest.fn(),
  };
  const persistCheckpoint = jest.fn();
  const services = createAgentRuntimeCommandServices({ options, persistCheckpoint });

  expect(services).toEqual({
    dispatchCommand: "command dispatcher",
    runInteractiveToolCall: "interactive runner",
  });
  expect(createInteractiveToolCallRunner).toHaveBeenCalledWith({
    oneShot: true,
    terminalInput: options.terminalInput,
    preserveHistory: repl.preserveHistory,
    closeReadline: repl.close,
    replaceReadline: repl.replace,
  });
  const dispatchOptions = createAgentRuntimeCommandDispatcher.mock.calls[0][0];
  expect(dispatchOptions).toMatchObject({
    runtimeState: options.runtimeState,
    getCwd: options.getCwd,
    setCwd: options.setCwd,
    repl,
    saveState: options.saveState,
  });
  dispatchOptions.persistCheckpoint("checkpoint");
  expect(persistCheckpoint).toHaveBeenCalledWith("checkpoint.json", "checkpoint");
});
