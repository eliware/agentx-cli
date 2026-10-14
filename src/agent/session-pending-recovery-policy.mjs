export function shouldRecoverPendingSession({ previousResponseId, pendingToolCalls, oneShot }) {
  return Boolean(previousResponseId && pendingToolCalls.length > 0 && !oneShot);
}
