import { expect, jest, test } from "@jest/globals";

const shouldRecoverPendingSession = jest.fn(() => false);
const recoverPendingSession = jest.fn();
await jest.unstable_mockModule("../../src/agent/session-pending-recovery.mjs", () => ({
  recoverPendingSession,
  shouldRecoverPendingSession,
}));

const { recoverAgentPendingSession } = await import("../../src/agent/runtime-pending-recovery.mjs");

test("skips recovery when no response is pending", async () => {
  await recoverAgentPendingSession({
    runtimeState: { previousResponseId: "", pendingToolCalls: [] },
    oneShot: false,
  });
  expect(shouldRecoverPendingSession).toHaveBeenCalledWith({
    previousResponseId: "",
    pendingToolCalls: [],
    oneShot: false,
  });
  expect(recoverPendingSession).not.toHaveBeenCalled();
});

test("passes pending recovery actions through runtime state", async () => {
  shouldRecoverPendingSession.mockReturnValue(true);
  const runtimeState = {
    previousResponseId: "response",
    pendingToolCalls: ["call"],
    openai: "client",
    template: "template",
    sessionUsage: "usage",
    debugEnabled: true,
  };
  const sessionPersistence = { getState: jest.fn(), setState: jest.fn() };
  const executePendingSessionTools = jest.fn();
  const persistCheckpoint = jest.fn();
  const clearSession = jest.fn();
  const writeTerminal = jest.fn();
  const options = {
    savedState: "saved",
    oneShot: false,
    terminalInput: "input",
    terminalOutput: "output",
    sessionPersistence,
    executePendingSessionTools,
    outputFlags: "flags",
    yoloEnabled: true,
    runtimeState,
    cwd: "C:/work",
    persistResponseSnapshot: jest.fn(),
    persistToolExecutionState: jest.fn(),
    confirmToolCall: jest.fn(),
    handleImageGeneration: jest.fn(),
    onWorkerComplete: jest.fn(),
    promptResumeMenu: jest.fn(),
    createUsageTotals: jest.fn(),
    createResumeToolCallRunner: jest.fn(),
    saveState: jest.fn(),
    checkpointPath: "checkpoint.json",
    persistCheckpoint,
    formatSystemMessage: (text) => `system:${text}`,
    writeTerminal,
    resetState: jest.fn(),
    statePath: "state.json",
    clearSession,
    extractTextFromResponse: jest.fn(),
  };

  await recoverAgentPendingSession(options);

  const recovery = recoverPendingSession.mock.calls[0][0];
  expect(recovery).toMatchObject({
    savedState: "saved",
    input: "input",
    output: "output",
    getState: sessionPersistence.getState,
    setState: sessionPersistence.setState,
  });
  const pendingAction = jest.fn();
  recovery.execute(pendingAction);
  const [runAction, actionContext] = executePendingSessionTools.mock.calls[0];
  expect(runAction).toBe(pendingAction);
  expect(actionContext).toMatchObject({
    savedState: "saved",
    oneShot: false,
    outputFlags: "flags",
    terminalInput: "input",
    yoloEnabled: true,
    getOpenAI: expect.any(Function),
    getTemplate: expect.any(Function),
    getCwd: expect.any(Function),
    getUsage: expect.any(Function),
    getDebugEnabled: expect.any(Function),
    now: expect.any(Function),
  });
  expect([actionContext.getOpenAI(), actionContext.getTemplate(), actionContext.getCwd()]).toEqual([
    "client",
    "template",
    "C:/work",
  ]);
  expect([actionContext.getUsage(), actionContext.getDebugEnabled()]).toEqual(["usage", true]);
  expect(typeof actionContext.now()).toBe("number");
  const deps = recovery.deps;
  deps.persistCheckpoint("checkpoint");
  deps.writeSystem("message");
  deps.clearSession();
  expect(persistCheckpoint).toHaveBeenCalledWith("checkpoint.json", "checkpoint");
  expect(writeTerminal).toHaveBeenCalledWith("system:message\n");
  expect(clearSession).toHaveBeenCalledWith("state.json");
});
