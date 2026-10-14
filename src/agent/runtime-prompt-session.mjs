import { runSessionPromptLoop } from "./session-prompt-loop.mjs";
import { shutdownAgentPromptSession } from "./runtime-session-shutdown.mjs";
import { createRuntimePromptInput } from "./runtime-prompt-input.mjs";

export async function runAgentPromptSession(
  context,
  services = { runLoop: runSessionPromptLoop, shutdown: shutdownAgentPromptSession },
) {
  const { terminalInput, repl, openai, signalRegistration } = context;
  try {
    await services.runLoop(createRuntimePromptInput(context));
  } finally {
    try {
      await services.shutdown({ repl, openai, signalRegistration });
    } finally {
      if (terminalInput?.isTTY) terminalInput.setRawMode?.(false);
    }
  }
}
