import { completeConversationTurn } from "./conversation-transitions.mjs";

export async function finalizeAgentTurn({
  response,
  userMessage,
  oneShot,
  getState,
  setState,
  extractAssistantText,
  saveState,
  persistCheckpoint,
  checkpointPath,
  clearSession,
  statePath,
  onOneShotComplete = async () => {},
  now = () => new Date().toISOString(),
}) {
  const state = getState();
  const assistantText = extractAssistantText(response);
  const nextState = completeConversationTurn(state, {
    response,
    userMessage,
    assistantText,
    timestamp: response?.id ? now() : undefined,
  });

  setState(nextState);
  await saveState();
  if (oneShot) {
    await clearSession(statePath);
    await onOneShotComplete();
  } else {
    const checkpoint = nextState.history?.find((entry) => entry.response_id === response.id);
    await persistCheckpoint(checkpointPath, {
      response_id: response.id,
      usage: checkpoint?.usage || state.usage,
      last_user_message: checkpoint?.last_user_message || userMessage,
      last_assistant_message: checkpoint?.last_assistant_message || assistantText,
      history: nextState.history,
    });
  }

  return { status: "completed", responseId: nextState.response_id };
}
