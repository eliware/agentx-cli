export function transitionPendingRecoveryState(result, state, extractAssistantText) {
  if (result.status === "completed")
    return {
      ...state,
      response_id: result.response?.id || state.response_id,
      last_assistant_message: extractAssistantText(result.response),
      pending_tool_calls: [],
    };
  return {
    ...state,
    failed_response: true,
    pending_tool_calls: result.preservePendingCalls ? state.pending_tool_calls : [],
  };
}
