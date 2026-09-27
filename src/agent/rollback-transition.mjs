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
