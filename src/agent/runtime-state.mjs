export function createAgentRuntimeState(session) {
  return {
    template: session.template,
    debugEnabled: Boolean(session.outputFlags.debug),
    openai: null,
    previousResponseId: session.restoredSession.previousResponseId,
    cwdNote: "",
    previousCwd: null,
    lastUserMessage: session.restoredSession.lastUserMessage,
    lastAssistantMessage: session.restoredSession.lastAssistantMessage,
    pendingCliTranscript: session.restoredSession.pendingCliTranscript,
    sessionUsage: session.restoredSession.sessionUsage,
    pendingToolCalls: session.restoredSession.pendingToolCalls,
    executionJournal: session.restoredSession.executionJournal,
    history: session.restoredSession.history,
    rollbackBackup: session.restoredSession.rollbackBackup,
    failedResponse: session.restoredSession.failedResponse,
    pendingRetryRequest: session.restoredSession.pendingRetryRequest,
    pendingTransaction: session.restoredSession.pendingTransaction,
    activeGoal: session.restoredSession.activeGoal,
  };
}
