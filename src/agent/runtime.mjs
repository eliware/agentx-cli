import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { clearSession } from "../conversation-state.mjs";
import { persistCheckpoint } from "../conversation-checkpoint.mjs";
import { prepareAgentSession } from "./session-bootstrap.mjs";
import { agentProcessLifecycle } from "./process-lifecycle.mjs";
import { runAgentPromptSession } from "./runtime-prompt-session.mjs";
import { startAgentRuntime } from "./runtime-startup.mjs";
import { createAgentRuntimeTurnContext } from "./runtime-turn-context.mjs";
import { setupAgentRuntimeRecovery } from "./runtime-recovery-setup.mjs";
import { createRuntimePromptContext } from "./runtime-prompt-context.mjs";

export async function runAgent({
  promptPath,
  cwd,
  input: terminalInput = defaultInput,
  output: terminalOutput = defaultOutput,
  initialMessage = null,
  oneShot = false,
  flags = null,
} = {}) {
  const session = await prepareAgentSession({ promptPath, cwd, oneShot, flags });
  const { outputFlags, checkpointPath, statePath } = session;
  const yoloEnabled = !outputFlags.confirm;
  const { runtimeState, createSessionClient, onWorkerComplete, repl, agentsText } =
    await startAgentRuntime({ session, cwd, oneShot, terminalInput, terminalOutput });
  const runtimeServices = await setupAgentRuntimeRecovery({
    session,
    runtimeState,
    terminalInput,
    terminalOutput,
    cwd,
    repl,
    onWorkerComplete,
  });
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
    persistCheckpoint,
    clearSession,
    createSessionClient,
    oneShot,
    cwd,
    yoloEnabled,
    agentsText,
    persistResponseSnapshot,
    persistToolExecutionState,
    confirmToolCall,
    handleImageGeneration,
    onWorkerComplete,
    setActiveOpenAI: agentProcessLifecycle.setActiveClient,
    getCwd: () => cwd,
    setCwd: (value) => {
      cwd = value;
    },
  });

  const promptContext = createRuntimePromptContext({
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
    signalRegistration: agentProcessLifecycle.signalRegistration,
  });
  return runAgentPromptSession(promptContext);
}
