import { expect, jest, test } from "@jest/globals";

const clearSession = jest.fn();
const persistCheckpoint = jest.fn();
const prepareAgentSession = jest.fn();
const setActiveClient = jest.fn();
const runAgentPromptSession = jest.fn(async () => "prompt result");
const startAgentRuntime = jest.fn();
const createAgentRuntimeTurnContext = jest.fn();
const setupAgentRuntimeRecovery = jest.fn();
const lifecycle = { setActiveClient, signalRegistration: "signals" };

await jest.unstable_mockModule("../../src/conversation-state.mjs", () => ({ clearSession }));
await jest.unstable_mockModule("../../src/conversation-checkpoint.mjs", () => ({
  persistCheckpoint,
}));
await jest.unstable_mockModule("../../src/agent/session-bootstrap.mjs", () => ({
  prepareAgentSession,
}));
await jest.unstable_mockModule("../../src/agent/process-lifecycle.mjs", () => ({
  agentProcessLifecycle: lifecycle,
}));
await jest.unstable_mockModule("../../src/agent/runtime-prompt-session.mjs", () => ({
  runAgentPromptSession,
}));
await jest.unstable_mockModule("../../src/agent/runtime-startup.mjs", () => ({
  startAgentRuntime,
}));
await jest.unstable_mockModule("../../src/agent/runtime-turn-context.mjs", () => ({
  createAgentRuntimeTurnContext,
}));
await jest.unstable_mockModule("../../src/agent/runtime-recovery-setup.mjs", () => ({
  setupAgentRuntimeRecovery,
}));

const { runAgent } = await import("../../src/agent/runtime.mjs");

test("wires default and supplied runtime options into prompt context", async () => {
  const session = {
    outputFlags: { confirm: false },
    checkpointPath: "checkpoint.json",
    statePath: "state.json",
  };
  const runtimeState = { openai: "client", activeGoal: null, pendingCliTranscript: "" };
  const createSessionClient = jest.fn();
  const onWorkerComplete = jest.fn();
  const repl = { getReadline: jest.fn() };
  const services = {
    sessionPersistence: {},
    saveState: jest.fn(),
    persistResponseSnapshot: jest.fn(),
    persistToolExecutionState: jest.fn(),
    resetState: jest.fn(),
    applyRollback: jest.fn(),
    confirmToolCall: jest.fn(),
    exitWithSummary: jest.fn(),
    handleImageGeneration: jest.fn(),
  };
  const turnContext = { dispatchCommand: jest.fn(), userTurnSession: {} };
  prepareAgentSession.mockResolvedValue(session);
  startAgentRuntime.mockResolvedValue({
    runtimeState,
    createSessionClient,
    onWorkerComplete,
    repl,
    agentsText: "rules",
  });
  setupAgentRuntimeRecovery.mockResolvedValue(services);
  createAgentRuntimeTurnContext.mockReturnValue(turnContext);

  await expect(runAgent()).resolves.toBe("prompt result");
  expect(prepareAgentSession).toHaveBeenLastCalledWith({
    promptPath: undefined,
    cwd: undefined,
    oneShot: false,
    flags: null,
  });
  expect(startAgentRuntime).toHaveBeenLastCalledWith({
    session,
    cwd: undefined,
    oneShot: false,
    terminalInput: process.stdin,
    terminalOutput: process.stdout,
  });

  const terminalInput = {};
  const terminalOutput = {};
  await runAgent({
    promptPath: "prompt.json",
    cwd: "C:/work",
    input: terminalInput,
    output: terminalOutput,
    initialMessage: "hello",
    oneShot: true,
    flags: { debug: true },
  });
  expect(prepareAgentSession).toHaveBeenLastCalledWith({
    promptPath: "prompt.json",
    cwd: "C:/work",
    oneShot: true,
    flags: { debug: true },
  });
  expect(setupAgentRuntimeRecovery).toHaveBeenLastCalledWith({
    session,
    runtimeState,
    terminalInput,
    terminalOutput,
    cwd: "C:/work",
    repl,
    onWorkerComplete,
  });
  const turnOptions = createAgentRuntimeTurnContext.mock.calls.at(-1)[0];
  expect(turnOptions).toMatchObject({
    promptPath: "prompt.json",
    terminalInput,
    terminalOutput,
    runtimeState,
    sessionPersistence: services.sessionPersistence,
    saveState: services.saveState,
    persistCheckpoint,
    clearSession,
    createSessionClient,
    oneShot: true,
    yoloEnabled: true,
    agentsText: "rules",
  });
  expect(turnOptions.getCwd()).toBe("C:/work");
  turnOptions.setCwd("C:/next");
  expect(turnOptions.getCwd()).toBe("C:/next");

  const promptOptions = runAgentPromptSession.mock.calls.at(-1)[0];
  expect(promptOptions.getActiveGoal()).toBeNull();
  expect(promptOptions.getPendingCliTranscript()).toBe("");
  expect(promptOptions).toMatchObject({
    oneShot: true,
    initialMessage: "hello",
    terminalInput,
    cwd: "C:/work",
    repl,
    dispatchCommand: turnContext.dispatchCommand,
    userTurnSession: turnContext.userTurnSession,
    openai: "client",
    signalRegistration: "signals",
  });
  promptOptions.setActiveGoal({ status: "active" });
  promptOptions.setPendingCliTranscript("pending");
  expect(runtimeState).toMatchObject({
    activeGoal: { status: "active" },
    pendingCliTranscript: "pending",
  });
});
