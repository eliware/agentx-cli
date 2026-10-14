export function updateExecutionJournal(state, { call, response, status, identity }) {
  const recordIdentity = identity || `id:${String(call?.call_id || call?.id || "")}`;
  const record = {
    identity: recordIdentity,
    status,
    response_id: String(response?.id || ""),
    updated_at: new Date().toISOString(),
  };
  return {
    ...state,
    execution_journal: [
      ...(state.execution_journal || []).filter((entry) => entry.identity !== recordIdentity),
      record,
    ].slice(-100),
  };
}
