import { expect, jest, test } from "@jest/globals";

const createAgentRuntimeTurnContext = jest.fn(() => ({
  dispatchCommand: "dispatch",
  userTurnSession: "turn",
}));
const createRuntimePromptContext = jest.fn((context) => context);
await jest.unstable_mockModule("../../src/agent/runtime-turn-context.mjs", () => ({
  createAgentRuntimeTurnContext,
}));
await jest.unstable_mockModule("../../src/agent/runtime-prompt-context.mjs", () => ({
  createRuntimePromptContext,
}));
const { createAgentRuntimeSessionContext } =
  await import("../../src/agent/runtime-session-context.mjs");

test("builds turn and prompt contexts from session services", () => {
  const runtimeState = { openai: "client" };
  const session = {
    outputFlags: { confirm: false },
    checkpointPath: "checkpoint",
    statePath: "state",
  };
  const runtimeServices = {
    sessionPersistence: "persistence",
    saveState: jest.fn(),
    persistResponseSnapshot: jest.fn(),
    persistToolExecutionState: jest.fn(),
    resetState: jest.fn(),
    applyRollback: jest.fn(),
    confirmToolCall: jest.fn(),
    exitWithSummary: jest.fn(),
    handleImageGeneration: jest.fn(),
    persistCheckpoint: jest.fn(),
    clearSession: jest.fn(),
  };
  const processLifecycle = { setActiveClient: jest.fn(), signalRegistration: "signals" };
  const repl = {};
  const promptContext = createAgentRuntimeSessionContext({
    promptPath: "prompt",
    cwd: "/repo",
    terminalInput: "input",
    terminalOutput: "output",
    initialMessage: "hello",
    oneShot: true,
    session,
    runtimeState,
    runtimeServices,
    createSessionClient: "client factory",
    onWorkerComplete: "worker callback",
    repl,
    agentsText: "rules",
    processLifecycle,
  });
  const turn = createAgentRuntimeTurnContext.mock.calls[0][0];
  expect(turn).toMatchObject({
    promptPath: "prompt",
    outputFlags: session.outputFlags,
    terminalInput: "input",
    terminalOutput: "output",
    statePath: "state",
    checkpointPath: "checkpoint",
    runtimeState,
    sessionPersistence: "persistence",
    saveState: runtimeServices.saveState,
    persistCheckpoint: runtimeServices.persistCheckpoint,
    clearSession: runtimeServices.clearSession,
    oneShot: true,
    yoloEnabled: true,
    agentsText: "rules",
    setActiveOpenAI: processLifecycle.setActiveClient,
  });
  expect(turn.getCwd()).toBe("/repo");
  turn.setCwd("/next");
  expect(turn.getCwd()).toBe("/next");
  expect(promptContext).toMatchObject({
    runtimeState,
    initialMessage: "hello",
    terminalInput: "input",
    cwd: "/repo",
    repl,
    dispatchCommand: "dispatch",
    userTurnSession: "turn",
    openai: "client",
    signalRegistration: "signals",
  });
});
