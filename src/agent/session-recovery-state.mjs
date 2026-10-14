export function applyRequestFailureState(state, recovery) {
  state.recoveryAttempts = recovery.recoveryAttempts;
  state.failedResponse = true;
  if (!state.pendingTransaction?.request) state.pendingToolCalls = [];
}

export function applyRecoveryMenuState(state, recovery) {
  state.recoveryAttempts = recovery.recoveryAttempts;
  state.newChainAttempts = recovery.newChainAttempts ?? state.newChainAttempts;
}
