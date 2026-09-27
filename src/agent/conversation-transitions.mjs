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

export function restoreSessionState(savedState, createUsageTotals) {
  const failedResponse = Boolean(savedState?.failed_response);
  const hasPendingTransaction = Boolean(failedResponse && savedState?.pending_retry_request);

  return {
    previousResponseId:
      failedResponse && !hasPendingTransaction
        ? savedState?.history?.at(-1)?.response_id || ""
        : savedState?.response_id || "",
    lastUserMessage: savedState?.last_user_message || "",
    lastAssistantMessage: savedState?.last_assistant_message || "",
    pendingCliTranscript: savedState?.pending_cli_transcript || "",
    sessionUsage: savedState?.usage
      ? {
          inputTokens: Number(savedState.usage.inputTokens ?? 0),
          cachedTokens: Number(savedState.usage.cachedTokens ?? 0),
          outputTokens: Number(savedState.usage.outputTokens ?? 0),
          turns: Number(savedState.usage.turns ?? 0),
        }
      : createUsageTotals(),
    pendingToolCalls: Array.isArray(savedState?.pending_tool_calls)
      ? savedState.pending_tool_calls
      : [],
    executionJournal: Array.isArray(savedState?.execution_journal)
      ? savedState.execution_journal
      : [],
    history: Array.isArray(savedState?.history) ? savedState.history : [],
    rollbackBackup: Array.isArray(savedState?.rollback_backup) ? savedState.rollback_backup : [],
    failedResponse,
    pendingRetryRequest: savedState?.pending_retry_request || null,
    pendingTransaction: savedState?.pending_transaction || null,
    hasPendingTransaction,
    activeGoal: null,
  };
}

export function applyRollbackSelection(state, selected) {
  const history = Array.isArray(state.history) ? state.history : [];
  const selectedIndex = history.findIndex((entry) => entry.response_id === selected?.response_id);
  if (selectedIndex < 0) throw new Error("Selected rollback checkpoint is no longer available.");

  return {
    ...state,
    response_id: selected.response_id,
    last_user_message: selected.last_user_message || "",
    last_assistant_message: selected.last_assistant_message || "",
    usage: { ...selected.usage },
    pending_cli_transcript: "",
    pending_tool_calls: [],
    execution_journal: [],
    pending_retry_request: null,
    pending_transaction: null,
    failed_response: false,
    goal: null,
    rollback_backup: history.slice(selectedIndex + 1),
    history: history.slice(0, selectedIndex + 1),
  };
}
