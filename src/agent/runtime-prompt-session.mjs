import { writeTerminal } from "../terminal-output.mjs";
import { formatPromptForCwd, formatSystemMessage } from "../shell-display.mjs";
import { appendCliTranscript } from "../request-context.mjs";
import { extractTextFromResponse } from "../response.mjs";
import { printAgentText } from "./repl.mjs";
import { prepareSessionInput } from "./session-input.mjs";
import { dispatchSessionInput } from "./session-input-dispatch.mjs";
import { handleSessionPromptError } from "./session-prompt-errors.mjs";
import { runSessionPromptLoop } from "./session-prompt-loop.mjs";
import { runSessionUserTurn } from "./session-user-turn.mjs";
import { runSessionRequestCycle } from "./session-request-cycle.mjs";
import { finalizeAgentTurn } from "./session-turn-finalization.mjs";
import { shutdownAgentPromptSession } from "./runtime-session-shutdown.mjs";
import { executeLocalShellCommand } from "./local-shell.mjs";

export async function runAgentPromptSession(
  context,
  services = { runLoop: runSessionPromptLoop, shutdown: shutdownAgentPromptSession },
) {
  const {
    oneShot,
    initialMessage,
    terminalInput,
    cwd,
    repl,
    getActiveGoal,
    setActiveGoal,
    saveState,
    exitWithSummary,
    getPendingCliTranscript,
    setPendingCliTranscript,
    dispatchCommand,
    userTurnSession,
    openai,
    signalRegistration,
  } = context;
  try {
    await services.runLoop({
      oneShot,
      initialMessage,
      readPrompt: async () => {
        prepareSessionInput({ oneShot, terminalInput });
        return repl.getReadline().question(formatPromptForCwd(cwd));
      },
      handlePromptError: (error) =>
        handleSessionPromptError(error, {
          getGoal: getActiveGoal,
          setGoal: setActiveGoal,
          saveState,
          write: writeTerminal,
          formatMessage: formatSystemMessage,
          exitWithSummary,
        }),
      dispatchInput: (line) =>
        dispatchSessionInput({
          message: line,
          cwd,
          input: terminalInput,
          readline: repl.getReadline(),
          oneShot,
          state: {
            get pendingCliTranscript() {
              return getPendingCliTranscript();
            },
            set pendingCliTranscript(value) {
              setPendingCliTranscript(value);
            },
          },
          deps: {
            appendCliTranscript,
            executeLocalShellCommand,
            preserveHistory: repl.preserveHistory,
            replaceReadline: repl.replace,
            writeSystem: (text) => writeTerminal(`${formatSystemMessage(text)}\n`),
            saveState,
            dispatchCommand,
          },
        }),
      processMessage: (message) =>
        runSessionUserTurn({
          message,
          session: userTurnSession,
          deps: {
            now: Date.now,
            runRequestCycle: runSessionRequestCycle,
            finalizeTurn: finalizeAgentTurn,
            printAgentText,
            extractAssistantText: extractTextFromResponse,
          },
        }),
    });
  } finally {
    await services.shutdown({ repl, openai, signalRegistration });
  }
}
