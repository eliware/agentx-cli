import { expect, jest, test } from "@jest/globals";

const writeTerminal = jest.fn();
const setTerminalOutputOptions = jest.fn();
const setActiveStatusController = jest.fn();
const formatSystemMessage = jest.fn((text) => `formatted:${text}`);
await jest.unstable_mockModule("../src/terminal-output.mjs", () => ({
  writeTerminal,
  setTerminalOutputOptions,
  setActiveStatusController,
}));
await jest.unstable_mockModule("../src/shell-display.mjs", () => ({
  formatSystemMessage,
  formatPromptForCwd: jest.fn((text) => text),
  formatCommandMessage: jest.fn((text) => text),
  formatMcpMessage: jest.fn((text) => text),
  formatCustomToolMessage: jest.fn((text) => text),
  formatInfoMessage: jest.fn((text) => text),
  formatUsageMessage: jest.fn((text) => text),
  formatFinalUsageMessage: jest.fn((text) => text),
  formatWhiteMessage: jest.fn((text) => text),
}));
const { createAgentRuntimeCommandDispatcher } =
  await import("../src/agent-runtime-command-dispatch.mjs");

test("adapts runtime state and context for the command dispatcher", () => {
  const createDispatcher = jest.fn((configuration) => configuration);
  const runtimeState = {
    activeGoal: "goal",
    template: { model: "m" },
    previousCwd: "old",
    sessionUsage: {},
    history: [],
  };
  const repl = {
    getReadline: jest.fn(),
    preserveHistory: jest.fn(),
    createReadline: jest.fn(),
    setReadline: jest.fn(),
  };
  const persistCheckpoint = jest.fn();
  const result = createAgentRuntimeCommandDispatcher({
    runtimeState,
    getCwd: () => "cwd",
    setCwd: jest.fn(),
    promptPath: "prompt",
    outputFlags: {},
    input: {},
    output: {},
    statePath: "state",
    checkpointPath: "checkpoint",
    repl,
    saveState: jest.fn(),
    exitWithSummary: jest.fn(),
    resetState: jest.fn(),
    applyRollback: jest.fn(),
    persistCheckpoint,
    createDispatcher,
  });
  expect(createDispatcher).toHaveBeenCalled();
  expect(result.state.getActiveGoal()).toBe("goal");
  result.state.setActiveGoal("next goal");
  expect(runtimeState.activeGoal).toBe("next goal");
  expect(result.state.getTemplate()).toEqual({ model: "m" });
  result.state.setTemplate({ model: "new" });
  expect(runtimeState.template).toEqual({ model: "new" });
  expect(result.state.getPreviousCwd()).toBe("old");
  result.state.setPreviousCwd("older");
  result.state.setCwdNote("note");
  expect(runtimeState).toMatchObject({ previousCwd: "older", cwdNote: "note" });
  expect(result.state.getCwd()).toBe("cwd");
  expect(result.state.getSessionUsage()).toBe(runtimeState.sessionUsage);
  expect(result.state.getHistory()).toBe(runtimeState.history);
  expect(result.context).toMatchObject({ promptPath: "prompt", statePath: "state" });
  expect(result.repl.getReadline).toBe(repl.getReadline);
  result.services.persistCheckpoint("snapshot");
  expect(persistCheckpoint).toHaveBeenCalledWith("checkpoint", "snapshot");
  result.services.writeSystem("status");
  expect(formatSystemMessage).toHaveBeenCalledWith("status");
  expect(writeTerminal).toHaveBeenCalledWith("formatted:status\n");
});

test("uses the default session command dispatcher", () => {
  const dispatcher = createAgentRuntimeCommandDispatcher({
    runtimeState: {},
    getCwd: () => ".",
    setCwd: jest.fn(),
    promptPath: "prompt",
    outputFlags: {},
    input: {},
    output: {},
    statePath: "state",
    checkpointPath: "checkpoint",
    repl: {},
    saveState: jest.fn(),
    exitWithSummary: jest.fn(),
    resetState: jest.fn(),
    applyRollback: jest.fn(),
    persistCheckpoint: jest.fn(),
  });
  expect(typeof dispatcher).toBe("function");
});
