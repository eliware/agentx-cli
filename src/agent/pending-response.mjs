export function createPendingResponse(savedState) {
  return {
    id: String(savedState?.response_id ?? ""),
    output: Array.isArray(savedState?.pending_tool_calls) ? savedState.pending_tool_calls : [],
  };
}

export function getToolCallId(call) {
  return String(call?.call_id || call?.id || "").trim();
}
