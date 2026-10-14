import { expect, jest, test } from "@jest/globals";
import { createAgentRuntimeCommandDispatcher } from "../src/agent-runtime-command-dispatch.mjs";

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
    persistCheckpoint: jest.fn(),
    createDispatcher,
  });
  expect(createDispatcher).toHaveBeenCalled();
  expect(result.state.getActiveGoal()).toBe("goal");
  expect(result.state.getTemplate()).toEqual({ model: "m" });
  expect(result.state.getPreviousCwd()).toBe("old");
  expect(result.context).toMatchObject({ promptPath: "prompt", statePath: "state" });
  expect(result.repl.getReadline).toBe(repl.getReadline);
});
