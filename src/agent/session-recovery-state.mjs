export function applyRequestFailureState(state, recovery) {
  state.recoveryAttempts = recovery.recoveryAttempts;
  state.failedResponse = true;
  if (!state.pendingTransaction?.request) state.pendingToolCalls = [];
}

export function applyRecoveryMenuState(state, recovery) {
  state.recoveryAttempts = recovery.recoveryAttempts;
  state.newChainAttempts = recovery.newChainAttempts ?? state.newChainAttempts;
}

export function clearPendingContinuationForNewChain(state) {
  state.previousResponseId = "";
  state.retryRequest = null;
  state.pendingRetryRequest = null;
  state.pendingTransaction = null;
  state.pendingToolCalls = [];
  state.executionJournal = [];
  state.failedResponse = false;
}
