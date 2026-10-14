import { persistResponseState } from "../conversation-state.mjs";
import { persistCheckpoint } from "../conversation-checkpoint.mjs";
import { extractTextFromResponse } from "../response.mjs";
import { confirmationFilePath, loadGlobalConfirmations } from "../confirmation-policy.mjs";
import { createSessionPersistence } from "./conversation-persistence.mjs";
import { handleSessionImageGeneration } from "./session-image-generation.mjs";
import { createSessionToolConfirmer } from "./session-confirmation.mjs";
import { exitSessionWithSummary } from "./session-exit.mjs";
import { printUsageReport } from "./repl.mjs";
import { applyAgentPersistedState, getAgentPersistedState } from "./runtime-state-persistence.mjs";
import { clearPersistedGoal } from "./session-restore.mjs";

export async function createAgentRuntimeServices({ session, runtimeState, terminalInput, repl }) {
  const { statePath, checkpointPath, oneShot, savedState } = session;
  const globalConfirmationPath = confirmationFilePath();
  const globalConfirmations = await loadGlobalConfirmations(globalConfirmationPath);
  const sessionPersistence = createSessionPersistence({
    statePath,
    checkpointPath,
    oneShot,
    getState: () => getAgentPersistedState(runtimeState),
    setState: (state) => applyAgentPersistedState(runtimeState, state),
    persistResponseState,
    persistCheckpoint,
    extractAssistantText: extractTextFromResponse,
  });
  const {
    saveState,
    persistResponseSnapshot,
    persistToolExecutionState,
    resetState,
    applyRollback,
  } = sessionPersistence;
  const handleImageGeneration = handleSessionImageGeneration({
    getTranscript: () => runtimeState.pendingCliTranscript,
    setTranscript: (value) => {
      runtimeState.pendingCliTranscript = value;
    },
    saveState,
  });
  await clearPersistedGoal(savedState, saveState);
  const confirmToolCall = createSessionToolConfirmer({
    oneShot,
    isTTY: terminalInput?.isTTY,
    getReadline: repl.getReadline,
    sessionConfirmations: new Set(),
    globalConfirmations,
    globalConfirmationPath,
  });
  const exitWithSummary = ({ leadingNewline = false } = {}) =>
    exitSessionWithSummary({
      noUsage: session.outputFlags.noUsage,
      usage: runtimeState.sessionUsage,
      model: runtimeState.template.model,
      leadingNewline,
      readline: repl.getReadline(),
      printUsageReport,
    });
  return {
    sessionPersistence,
    saveState,
    persistResponseSnapshot,
    persistToolExecutionState,
    resetState,
    applyRollback,
    confirmToolCall,
    exitWithSummary,
    handleImageGeneration,
  };
}
