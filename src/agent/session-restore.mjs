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
