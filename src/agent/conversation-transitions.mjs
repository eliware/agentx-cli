export function applyResponseSnapshot(
  state,
  snapshot,
  { assistantText = "", timestamp = new Date().toISOString(), oneShot = false } = {},
) {
  const response = snapshot?.response;
  const pendingToolCalls = Array.isArray(snapshot?.pendingToolCalls)
    ? snapshot.pendingToolCalls
    : [];
  const nextState = {
    ...state,
    response_id: response?.id || state.response_id,
    pending_tool_calls: pendingToolCalls,
  };

  if (response?.id && pendingToolCalls.length > 0) {
    nextState.pending_transaction = {
      base_response_id: response.id,
      calls: pendingToolCalls,
      request: null,
      execution_journal: state.execution_journal,
    };
  }

  if (response?.id && pendingToolCalls.length === 0) {
    const lastAssistantMessage = assistantText;
    const history = [
      ...(state.history || []).filter((entry) => entry.response_id !== response.id),
      {
        response_id: response.id,
        timestamp,
        user_preview: state.last_user_message.slice(0, 20),
        assistant_preview: lastAssistantMessage.slice(0, 20),
        usage: { ...state.usage },
        last_user_message: state.last_user_message,
        last_assistant_message: lastAssistantMessage,
      },
    ].slice(-20);
    Object.assign(nextState, {
      failed_response: false,
      pending_retry_request: null,
      pending_transaction: null,
      last_assistant_message: lastAssistantMessage,
      history,
    });

    return {
      state: nextState,
      checkpoint: oneShot
        ? null
        : {
            response_id: response.id,
            usage: nextState.usage,
            last_user_message: nextState.last_user_message,
            last_assistant_message: lastAssistantMessage,
            history,
          },
    };
  }

  return { state: nextState, checkpoint: null };
}

export function resetSessionState(state, emptyUsage) {
  return {
    ...state,
    response_id: "",
    usage: emptyUsage,
    last_user_message: "",
    last_assistant_message: "",
    pending_cli_transcript: "",
    pending_tool_calls: [],
    execution_journal: [],
    history: [],
    rollback_backup: [],
    failed_response: false,
    pending_retry_request: null,
    pending_transaction: null,
    goal: null,
  };
}
