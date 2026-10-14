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
