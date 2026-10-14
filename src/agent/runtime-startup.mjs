import { setTerminalOutputOptions, writeTerminal } from "../terminal-output.mjs";
import { formatSystemMessage } from "../shell-display.mjs";
import { formatUsageReport } from "../response.mjs";
import { formatStartupSettings, settingsFromEnv } from "../settings.mjs";
import { createReplInterface, printResumeMessage } from "./repl.mjs";
import { createAgentClient } from "./client.mjs";
import { presentAgentSession } from "./session-presentation.mjs";
import { agentProcessLifecycle } from "./process-lifecycle.mjs";
import { reportSessionWorkerUsage } from "./session-worker-usage.mjs";
import { createAgentRuntimeState } from "./runtime-state.mjs";
import { createSessionRepl } from "./session-repl.mjs";

export async function startAgentRuntime({ session, cwd, oneShot, terminalInput, terminalOutput }) {
  const { outputFlags, apiKey, savedState, savedResponseId, restoredSession, agentsText } = session;
  setTerminalOutputOptions({ colors: !outputFlags.noColors });
  const runtimeState = createAgentRuntimeState(session);
  const createSessionClient = () =>
    createAgentClient({ apiKey, isDebugEnabled: () => runtimeState.debugEnabled });
  runtimeState.openai = createSessionClient();
  agentProcessLifecycle.setActiveClient(runtimeState.openai);
  presentAgentSession({
    outputFlags,
    savedState,
    savedResponseId,
    restoredSession,
    agentsText,
    oneShot,
    settings: outputFlags.quiet ? "" : formatStartupSettings(settingsFromEnv()),
    formatSystemMessage,
    write: writeTerminal,
    printResumeMessage,
  });
  const onWorkerComplete = (worker) =>
    reportSessionWorkerUsage({
      worker,
      noUsage: outputFlags.noUsage,
      model: runtimeState.template?.model,
      formatUsageReport,
      write: writeTerminal,
    });
  const repl = createSessionRepl({
    oneShot,
    getCwd: () => cwd,
    input: terminalInput,
    output: terminalOutput,
    createInterface: createReplInterface,
  });
  return { runtimeState, createSessionClient, onWorkerComplete, repl, agentsText };
}
