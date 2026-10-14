import { createAgentRuntimeTurnContext } from "./runtime-turn-context.mjs";
import { createRuntimePromptContext } from "./runtime-prompt-context.mjs";
import { createSessionWorkingDirectory } from "./session-working-directory.mjs";

export function createAgentRuntimeSessionContext({
  promptPath,
  cwd,
  terminalInput,
  terminalOutput,
  initialMessage,
  oneShot,
  session,
  runtimeState,
  runtimeServices,
  createSessionClient,
  onWorkerComplete,
  repl,
  agentsText,
  processLifecycle,
}) {
  const { outputFlags, checkpointPath, statePath } = session;
  const workingDirectory = createSessionWorkingDirectory(cwd);
  const {
    sessionPersistence,
    saveState,
    persistResponseSnapshot,
    persistToolExecutionState,
    resetState,
    applyRollback,
    confirmToolCall,
    exitWithSummary,
    handleImageGeneration,
  } = runtimeServices;
  const { dispatchCommand, userTurnSession } = createAgentRuntimeTurnContext({
    promptPath,
    outputFlags,
    terminalInput,
    terminalOutput,
    statePath,
    checkpointPath,
    repl,
    runtimeState,
    sessionPersistence,
    saveState,
    exitWithSummary,
    resetState,
    applyRollback,
    createSessionClient,
    oneShot,
    cwd,
    yoloEnabled: !outputFlags.confirm,
    agentsText,
    persistResponseSnapshot,
    persistToolExecutionState,
    confirmToolCall,
    handleImageGeneration,
    onWorkerComplete,
    setActiveOpenAI: processLifecycle.setActiveClient,
    getCwd: workingDirectory.get,
    setCwd: workingDirectory.set,
    persistCheckpoint: runtimeServices.persistCheckpoint,
    clearSession: runtimeServices.clearSession,
  });
  return createRuntimePromptContext({
    runtimeState,
    oneShot,
    initialMessage,
    terminalInput,
    cwd,
    repl,
    saveState,
    exitWithSummary,
    dispatchCommand,
    userTurnSession,
    openai: runtimeState.openai,
    signalRegistration: processLifecycle.signalRegistration,
  });
}
