import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { clearSession } from "../conversation-state.mjs";
import { persistCheckpoint } from "../conversation-checkpoint.mjs";
import { prepareAgentSession } from "./session-bootstrap.mjs";
import { agentProcessLifecycle } from "./process-lifecycle.mjs";
import { runAgentPromptSession } from "./runtime-prompt-session.mjs";
import { startAgentRuntime } from "./runtime-startup.mjs";
import { setupAgentRuntimeRecovery } from "./runtime-recovery-setup.mjs";
import { createAgentRuntimeSessionContext } from "./runtime-session-context.mjs";

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
  const promptContext = createAgentRuntimeSessionContext({
    promptPath,
    cwd,
    terminalInput,
    terminalOutput,
    initialMessage,
    oneShot,
    session,
    runtimeState,
    runtimeServices: {
      ...runtimeServices,
      persistCheckpoint,
      clearSession,
    },
    createSessionClient,
    onWorkerComplete,
    repl,
    agentsText,
    processLifecycle: agentProcessLifecycle,
  });
  return runAgentPromptSession(promptContext);
}
