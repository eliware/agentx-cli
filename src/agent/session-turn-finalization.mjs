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
    pending_cli_transcript: "",
    failed_response: false,
    rollback_backup: [],
  };

  if (response?.id) {
    nextState.history = [
      ...(state.history || []),
      {
        response_id: response.id,
        timestamp: now(),
        user_preview: userMessage.slice(0, 20),
        assistant_preview: assistantText.slice(0, 20),
        usage: { ...state.usage },
        last_user_message: userMessage,
        last_assistant_message: assistantText,
      },
    ].slice(-20);
  }

  setState(nextState);
  await saveState();
  if (oneShot) {
    await clearSession(statePath);
    await onOneShotComplete();
  } else {
    await persistCheckpoint(checkpointPath, {
      response_id: response.id,
      usage: state.usage,
      last_user_message: userMessage,
      last_assistant_message: assistantText,
      history: nextState.history,
    });
  }

  return { status: "completed", responseId };
}
