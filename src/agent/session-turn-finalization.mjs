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
  const responseId = response?.id || state.response_id;
  const nextState = {
    ...state,
    response_id: responseId,
    last_user_message: userMessage,
    last_assistant_message: assistantText,
    pending_tool_calls: [],
    pending_retry_request: null,
    pending_transaction: null,
    pending_cli_transcript: "",
    failed_response: false,
    rollback_backup: [],
  };

  if (response?.id) {
    const completedEntry = (state.history || []).find(
      (entry) => entry.response_id === response.id,
    ) || {
      response_id: response.id,
      timestamp: now(),
      user_preview: userMessage.slice(0, 20),
      assistant_preview: assistantText.slice(0, 20),
      usage: { ...state.usage },
      last_user_message: userMessage,
      last_assistant_message: assistantText,
    };
    nextState.history = [
      ...(state.history || []).filter((entry) => entry.response_id !== response.id),
      completedEntry,
    ].slice(-20);
  }

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

  return { status: "completed", responseId };
}
