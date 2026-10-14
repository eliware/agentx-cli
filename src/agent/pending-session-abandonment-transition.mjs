export function restorePendingSessionCheckpoint(state, createUsageTotals) {
  const checkpoint = state.history.at(-1);
  return {
    checkpoint,
    state: {
      ...state,
      response_id: checkpoint?.response_id || "",
      last_user_message: checkpoint?.last_user_message || "",
      last_assistant_message: checkpoint?.last_assistant_message || "",
      usage: checkpoint?.usage ? { ...checkpoint.usage } : createUsageTotals(),
      pending_tool_calls: [],
      pending_retry_request: null,
      pending_transaction: null,
      failed_response: false,
    },
  };
}
