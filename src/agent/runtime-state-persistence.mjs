export function getAgentPersistedState(state) {
  return {
    response_id: state.previousResponseId,
    usage: state.sessionUsage,
    last_user_message: state.lastUserMessage,
    last_assistant_message: state.lastAssistantMessage,
    pending_tool_calls: state.pendingToolCalls,
    history: state.history,
    failed_response: state.failedResponse,
    pending_retry_request: state.pendingRetryRequest,
    pending_transaction: state.pendingTransaction,
    pending_cli_transcript: state.pendingCliTranscript,
    execution_journal: state.executionJournal,
    rollback_backup: state.rollbackBackup,
    goal: state.activeGoal,
  };
}

export function applyAgentPersistedState(state, saved) {
  state.previousResponseId = saved.response_id;
  state.sessionUsage = saved.usage;
  state.lastUserMessage = saved.last_user_message;
  state.lastAssistantMessage = saved.last_assistant_message;
  state.pendingCliTranscript = saved.pending_cli_transcript;
  state.pendingToolCalls = saved.pending_tool_calls;
  state.executionJournal = saved.execution_journal;
  state.history = saved.history;
  state.rollbackBackup = saved.rollback_backup;
  state.failedResponse = saved.failed_response;
  state.pendingRetryRequest = saved.pending_retry_request;
  state.pendingTransaction = saved.pending_transaction;
  state.activeGoal = saved.goal;
}
