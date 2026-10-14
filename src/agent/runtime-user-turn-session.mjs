export function createAgentUserTurnSession({
  runtimeState,
  sessionPersistence,
  requestContext,
  oneShot,
  checkpointPath,
  statePath,
  exitWithSummary,
  saveState,
  persistCheckpoint,
  clearSession,
}) {
  return {
    oneShot,
    checkpointPath,
    statePath,
    exitWithSummary,
    getPersistedState: sessionPersistence.getState,
    setPersistedState: sessionPersistence.setState,
    saveState,
    persistCheckpoint,
    clearSession,
    getPendingCliTranscript: () => runtimeState.pendingCliTranscript,
    getCwdNote: () => runtimeState.cwdNote,
    setCwdNote: (value) => {
      runtimeState.cwdNote = value;
    },
    setLastUserMessage: (value) => {
      runtimeState.lastUserMessage = value;
    },
    getOpenAI: () => runtimeState.openai,
    setOpenAI: (value) => {
      runtimeState.openai = value;
    },
    getPreviousResponseId: () => runtimeState.previousResponseId,
    setPreviousResponseId: (value) => {
      runtimeState.previousResponseId = value;
    },
    getPendingRetryRequest: () => runtimeState.pendingRetryRequest,
    setPendingRetryRequest: (value) => {
      runtimeState.pendingRetryRequest = value;
    },
    getPendingTransaction: () => runtimeState.pendingTransaction,
    setPendingTransaction: (value) => {
      runtimeState.pendingTransaction = value;
    },
    getPendingToolCalls: () => runtimeState.pendingToolCalls,
    setPendingToolCalls: (value) => {
      runtimeState.pendingToolCalls = value;
    },
    getFailedResponse: () => runtimeState.failedResponse,
    setFailedResponse: (value) => {
      runtimeState.failedResponse = value;
    },
    getDebugEnabled: () => runtimeState.debugEnabled,
    setDebugEnabled: (value) => {
      runtimeState.debugEnabled = value;
    },
    requestContext,
  };
}
