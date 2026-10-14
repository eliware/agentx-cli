export function prepareSessionUserTurnState(session, message) {
  session.setCwdNote("");
  session.setLastUserMessage(message);
  session.setPendingRetryRequest(null);
  session.setPendingTransaction(null);
  session.setPendingToolCalls([]);
  session.setFailedResponse(false);
}
