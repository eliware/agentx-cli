export function createRecoveryState(session) {
  let retryRequest = null;
  let recoveryAttempts = 0;
  let newChainAttempts = 0;
  let websocketRecoveryAttempts = 0;
  let websocketRecoveryStartedAt = null;
  return {
    get openai() {
      return session.getOpenAI();
    },
    set openai(value) {
      session.setOpenAI(value);
    },
    get previousResponseId() {
      return session.getPreviousResponseId();
    },
    set previousResponseId(value) {
      session.setPreviousResponseId(value);
    },
    get retryRequest() {
      return retryRequest;
    },
    set retryRequest(value) {
      retryRequest = value;
    },
    get pendingRetryRequest() {
      return session.getPendingRetryRequest();
    },
    set pendingRetryRequest(value) {
      session.setPendingRetryRequest(value);
    },
    get pendingTransaction() {
      return session.getPendingTransaction();
    },
    set pendingTransaction(value) {
      session.setPendingTransaction(value);
    },
    get pendingToolCalls() {
      return session.getPendingToolCalls();
    },
    set pendingToolCalls(value) {
      session.setPendingToolCalls(value);
    },
    get failedResponse() {
      return session.getFailedResponse();
    },
    set failedResponse(value) {
      session.setFailedResponse(value);
    },
    get recoveryAttempts() {
      return recoveryAttempts;
    },
    set recoveryAttempts(value) {
      recoveryAttempts = value;
    },
    get newChainAttempts() {
      return newChainAttempts;
    },
    set newChainAttempts(value) {
      newChainAttempts = value;
    },
    get websocketRecoveryAttempts() {
      return websocketRecoveryAttempts;
    },
    set websocketRecoveryAttempts(value) {
      websocketRecoveryAttempts = value;
    },
    get websocketRecoveryStartedAt() {
      return websocketRecoveryStartedAt;
    },
    set websocketRecoveryStartedAt(value) {
      websocketRecoveryStartedAt = value;
    },
    get debugEnabled() {
      return session.getDebugEnabled();
    },
    set debugEnabled(value) {
      session.setDebugEnabled(value);
    },
  };
}
