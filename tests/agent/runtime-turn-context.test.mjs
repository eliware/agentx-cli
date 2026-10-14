import { expect, jest, test } from "@jest/globals";

const dispatchCommand = jest.fn();
const runInteractiveToolCall = jest.fn();
const recoveryDependencies = { writeSystem: jest.fn() };
const requestContext = { getTemplate: jest.fn() };
const userTurnSession = { run: jest.fn() };
const createAgentRuntimeCommandServices = jest.fn(() => ({
  dispatchCommand,
  runInteractiveToolCall,
}));
const createAgentRecoveryContext = jest.fn(() => recoveryDependencies);
const createAgentRequestContext = jest.fn(() => requestContext);
const createAgentUserTurnSession = jest.fn(() => userTurnSession);

await jest.unstable_mockModule("../../src/agent/runtime-command-services.mjs", () => ({
  createAgentRuntimeCommandServices,
}));
await jest.unstable_mockModule("../../src/agent/runtime-recovery-context.mjs", () => ({
  createAgentRecoveryContext,
}));
await jest.unstable_mockModule("../../src/agent/runtime-request-context.mjs", () => ({
  createAgentRequestContext,
}));
await jest.unstable_mockModule("../../src/agent/runtime-user-turn-session.mjs", () => ({
  createAgentUserTurnSession,
}));

const { createAgentRuntimeTurnContext } = await import("../../src/agent/runtime-turn-context.mjs");

test("wires runtime services into the command and user-turn contexts", () => {
  const refs = Object.fromEntries(
    [
      "promptPath",
      "outputFlags",
      "terminalInput",
      "terminalOutput",
      "statePath",
      "checkpointPath",
      "repl",
      "runtimeState",
      "sessionPersistence",
      "saveState",
      "exitWithSummary",
      "resetState",
      "applyRollback",
      "persistCheckpoint",
      "clearSession",
      "createSessionClient",
      "persistResponseSnapshot",
      "persistToolExecutionState",
      "confirmToolCall",
      "handleImageGeneration",
      "onWorkerComplete",
      "setActiveOpenAI",
      "getCwd",
      "setCwd",
    ].map((key) => [key, { key }]),
  );
  const options = { ...refs, oneShot: true, yoloEnabled: false, agentsText: "agent rules" };

  const result = createAgentRuntimeTurnContext(options);

  expect(createAgentRuntimeCommandServices).toHaveBeenCalledWith({
    options: {
      oneShot: true,
      terminalInput: refs.terminalInput,
      repl: refs.repl,
      runtimeState: refs.runtimeState,
      promptPath: refs.promptPath,
      outputFlags: refs.outputFlags,
      terminalOutput: refs.terminalOutput,
      statePath: refs.statePath,
      checkpointPath: refs.checkpointPath,
      getCwd: refs.getCwd,
      setCwd: refs.setCwd,
      saveState: refs.saveState,
      exitWithSummary: refs.exitWithSummary,
      resetState: refs.resetState,
      applyRollback: refs.applyRollback,
    },
    persistCheckpoint: refs.persistCheckpoint,
  });
  expect(createAgentRecoveryContext).toHaveBeenCalledWith({
    input: refs.terminalInput,
    repl: refs.repl,
    applyRollback: refs.applyRollback,
    resetState: refs.resetState,
    callbacks: {
      setActiveOpenAI: refs.setActiveOpenAI,
      saveState: refs.saveState,
      persistCheckpoint: refs.persistCheckpoint,
      clearSession: refs.clearSession,
    },
  });
  expect(createAgentRequestContext).toHaveBeenCalledWith({
    state: { runtime: refs.runtimeState, agentsText: "agent rules" },
    cwd: refs.getCwd,
    oneShot: true,
    input: refs.terminalInput,
    output: refs.terminalOutput,
    outputFlags: refs.outputFlags,
    yoloEnabled: false,
    paths: { statePath: refs.statePath, checkpointPath: refs.checkpointPath },
    createClient: refs.createSessionClient,
    repl: refs.repl,
    callbacks: {
      saveState: refs.saveState,
      persistResponseSnapshot: refs.persistResponseSnapshot,
      persistToolExecutionState: refs.persistToolExecutionState,
      confirmToolCall: refs.confirmToolCall,
      runInteractiveToolCall,
      handleImageGeneration: refs.handleImageGeneration,
      onWorkerComplete: refs.onWorkerComplete,
    },
    recovery: recoveryDependencies,
  });
  expect(createAgentUserTurnSession).toHaveBeenCalledWith({
    runtimeState: refs.runtimeState,
    sessionPersistence: refs.sessionPersistence,
    requestContext,
    oneShot: true,
    checkpointPath: refs.checkpointPath,
    statePath: refs.statePath,
    exitWithSummary: refs.exitWithSummary,
    saveState: refs.saveState,
    persistCheckpoint: refs.persistCheckpoint,
    clearSession: refs.clearSession,
  });
  expect(result).toEqual({ dispatchCommand, userTurnSession });
});
