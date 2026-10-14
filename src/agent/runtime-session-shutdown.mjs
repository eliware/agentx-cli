import { setTerminalOutputOptions } from "../terminal-output.mjs";
import { shutdownAgentSession } from "./session-shutdown.mjs";
import { agentProcessLifecycle } from "./process-lifecycle.mjs";

export function shutdownAgentPromptSession(
  { repl, openai, signalRegistration },
  shutdown = shutdownAgentSession,
) {
  return shutdown({
    readline: repl.getReadline(),
    client: openai,
    signalRegistration,
    deps: {
      clearActiveClient: agentProcessLifecycle.clearActiveClient,
      terminateWorkers: agentProcessLifecycle.terminateWorkers,
      restoreTerminalOutput: () => setTerminalOutputOptions({ colors: true }),
    },
  });
}
