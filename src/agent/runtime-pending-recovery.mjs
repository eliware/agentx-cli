import { recoverPendingSession, shouldRecoverPendingSession } from "./session-pending-recovery.mjs";

export async function recoverAgentPendingSession({
  savedState,
  oneShot,
  terminalInput,
  terminalOutput,
  sessionPersistence,
  executePendingSessionTools,
  outputFlags,
  yoloEnabled,
  runtimeState,
  cwd,
  persistResponseSnapshot,
  persistToolExecutionState,
  confirmToolCall,
  handleImageGeneration,
  onWorkerComplete,
  promptResumeMenu,
  createUsageTotals,
  createResumeToolCallRunner,
  saveState,
  checkpointPath,
  persistCheckpoint,
  formatSystemMessage,
  writeTerminal,
  resetState,
  statePath,
  clearSession,
  extractTextFromResponse,
}) {
  if (
    shouldRecoverPendingSession({
      previousResponseId: runtimeState.previousResponseId,
      pendingToolCalls: runtimeState.pendingToolCalls,
      oneShot,
    })
  ) {
    await recoverPendingSession({
      savedState,
      input: terminalInput,
      output: terminalOutput,
      getState: sessionPersistence.getState,
      setState: sessionPersistence.setState,
      execute: (runPendingToolCall) =>
        executePendingSessionTools(runPendingToolCall, {
          savedState,
          oneShot,
          outputFlags,
          terminalInput,
          yoloEnabled,
          getOpenAI: () => runtimeState.openai,
          getTemplate: () => runtimeState.template,
          getCwd: () => cwd,
          getUsage: () => runtimeState.sessionUsage,
          getDebugEnabled: () => runtimeState.debugEnabled,
          persistResponseSnapshot,
          persistToolExecutionState,
          confirmToolCall,
          handleImageGeneration,
          onWorkerComplete,
          now: Date.now,
        }),
      deps: {
        promptResumeMenu,
        createUsageTotals,
        createRunner: createResumeToolCallRunner,
        saveState,
        persistCheckpoint: (checkpoint) => persistCheckpoint(checkpointPath, checkpoint),
        writeSystem: (text) => writeTerminal(`${formatSystemMessage(text)}\n`),
        resetState,
        clearSession: () => clearSession(statePath),
        extractAssistantText: extractTextFromResponse,
      },
    });
  }
}
