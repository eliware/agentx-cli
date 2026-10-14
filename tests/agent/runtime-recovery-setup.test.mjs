import { expect, jest, test } from "@jest/globals";

const persistCheckpoint = jest.fn();
const clearSession = jest.fn();
const createUsageTotals = jest.fn();
const extractTextFromResponse = jest.fn();
const formatSystemMessage = jest.fn();
const promptResumeMenu = jest.fn();
const writeTerminal = jest.fn();
const createResumeToolCallRunner = jest.fn();
const executePendingSessionTools = jest.fn();
const createAgentRuntimeServices = jest.fn();
const recoverAgentPendingSession = jest.fn();

await jest.unstable_mockModule("../../src/conversation-checkpoint.mjs", () => ({
  persistCheckpoint,
}));
await jest.unstable_mockModule("../../src/conversation-state.mjs", () => ({ clearSession }));
await jest.unstable_mockModule("../../src/response.mjs", () => ({
  createUsageTotals,
  extractTextFromResponse,
}));
await jest.unstable_mockModule("../../src/shell-display.mjs", () => ({ formatSystemMessage }));
await jest.unstable_mockModule("../../src/resume-menu.mjs", () => ({ promptResumeMenu }));
await jest.unstable_mockModule("../../src/terminal-output.mjs", () => ({ writeTerminal }));
await jest.unstable_mockModule("../../src/agent/recovery.mjs", () => ({
  createResumeToolCallRunner,
}));
await jest.unstable_mockModule("../../src/agent/session-pending-executor.mjs", () => ({
  executePendingSessionTools,
}));
await jest.unstable_mockModule("../../src/agent/runtime-services.mjs", () => ({
  createAgentRuntimeServices,
}));
await jest.unstable_mockModule("../../src/agent/runtime-pending-recovery.mjs", () => ({
  recoverAgentPendingSession,
}));

const { setupAgentRuntimeRecovery } = await import("../../src/agent/runtime-recovery-setup.mjs");

test("wires runtime services into pending-session recovery", async () => {
  const session = {
    outputFlags: { confirm: false, noUsage: true },
    savedState: { response_id: "saved" },
    oneShot: false,
    checkpointPath: "checkpoint.json",
    statePath: "state.json",
  };
  const runtimeState = { previousResponseId: "response", pendingToolCalls: [] };
  const terminalInput = { isTTY: true };
  const terminalOutput = { isTTY: true };
  const cwd = "C:/work";
  const repl = { getReadline: jest.fn() };
  const onWorkerComplete = jest.fn();
  const services = {
    sessionPersistence: { saveState: jest.fn() },
    persistResponseSnapshot: jest.fn(),
    persistToolExecutionState: jest.fn(),
    confirmToolCall: jest.fn(),
    handleImageGeneration: jest.fn(),
    saveState: jest.fn(),
    resetState: jest.fn(),
  };
  createAgentRuntimeServices.mockResolvedValue(services);

  await expect(
    setupAgentRuntimeRecovery({
      session,
      runtimeState,
      terminalInput,
      terminalOutput,
      cwd,
      repl,
      onWorkerComplete,
    }),
  ).resolves.toBe(services);

  expect(createAgentRuntimeServices).toHaveBeenCalledWith({
    session,
    runtimeState,
    terminalInput,
    repl,
  });
  expect(recoverAgentPendingSession).toHaveBeenCalledWith({
    savedState: session.savedState,
    oneShot: false,
    terminalInput,
    terminalOutput,
    sessionPersistence: services.sessionPersistence,
    executePendingSessionTools,
    outputFlags: session.outputFlags,
    yoloEnabled: true,
    runtimeState,
    cwd,
    persistResponseSnapshot: services.persistResponseSnapshot,
    persistToolExecutionState: services.persistToolExecutionState,
    confirmToolCall: services.confirmToolCall,
    handleImageGeneration: services.handleImageGeneration,
    onWorkerComplete,
    promptResumeMenu,
    createUsageTotals,
    createResumeToolCallRunner,
    saveState: services.saveState,
    checkpointPath: session.checkpointPath,
    persistCheckpoint,
    formatSystemMessage,
    writeTerminal,
    resetState: services.resetState,
    statePath: session.statePath,
    clearSession,
    extractTextFromResponse,
  });
});
