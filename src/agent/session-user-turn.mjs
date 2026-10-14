import { buildRequestMessage } from "../request-context.mjs";
import { createRecoveryState } from "./session-recovery-accessors.mjs";

export async function runSessionUserTurn({ message, session, deps }) {
  const requestMessage = buildRequestMessage({
    pendingCliTranscript: session.getPendingCliTranscript(),
    cwdNote: session.getCwdNote(),
    message,
  });
  const sessionStartedAt = deps.now();
  session.setCwdNote("");
  session.setLastUserMessage(message);
  session.setPendingRetryRequest(null);
  session.setPendingTransaction(null);
  session.setPendingToolCalls([]);
  session.setFailedResponse(false);
  await session.saveState();

  const result = await deps.runRequestCycle({
    message,
    requestMessage,
    sessionStartedAt,
    state: createRecoveryState(session),
    context: session.requestContext,
    deps: { printAgentText: deps.printAgentText, ...deps.requestCycleDependencies },
  });
  if (!result.response) {
    if (session.oneShot)
      throw result.error || new Error("One-shot request ended without a response.");
    return "continue";
  }

  await deps.finalizeTurn({
    response: result.response,
    userMessage: message,
    oneShot: session.oneShot,
    getState: session.getPersistedState,
    setState: session.setPersistedState,
    extractAssistantText: deps.extractAssistantText,
    saveState: session.saveState,
    persistCheckpoint: session.persistCheckpoint,
    checkpointPath: session.checkpointPath,
    clearSession: session.clearSession,
    statePath: session.statePath,
    onOneShotComplete: session.exitWithSummary,
  });
  return session.oneShot ? "exit" : "continue";
}
