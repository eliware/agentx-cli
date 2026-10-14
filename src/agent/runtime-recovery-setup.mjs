import { persistCheckpoint } from "../conversation-checkpoint.mjs";
import { clearSession } from "../conversation-state.mjs";
import { createUsageTotals, extractTextFromResponse } from "../response.mjs";
import { formatSystemMessage } from "../shell-display.mjs";
import { promptResumeMenu } from "../resume-menu.mjs";
import { writeTerminal } from "../terminal-output.mjs";
import { createResumeToolCallRunner } from "./recovery.mjs";
import { executePendingSessionTools } from "./session-pending-executor.mjs";
import { createAgentRuntimeServices } from "./runtime-services.mjs";
import { recoverAgentPendingSession } from "./runtime-pending-recovery.mjs";

export async function setupAgentRuntimeRecovery({
  session,
  runtimeState,
  terminalInput,
  terminalOutput,
  cwd,
  repl,
  onWorkerComplete,
}) {
  const services = await createAgentRuntimeServices({ session, runtimeState, terminalInput, repl });
  const { outputFlags, savedState, checkpointPath, statePath } = session;
  await recoverAgentPendingSession({
    savedState,
    oneShot: session.oneShot,
    terminalInput,
    terminalOutput,
    sessionPersistence: services.sessionPersistence,
    executePendingSessionTools,
    outputFlags,
    yoloEnabled: !outputFlags.confirm,
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
    checkpointPath,
    persistCheckpoint,
    formatSystemMessage,
    writeTerminal,
    resetState: services.resetState,
    statePath,
    clearSession,
    extractTextFromResponse,
  });
  return services;
}
