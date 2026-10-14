export async function isWebsocketRetryAvailable(error, state, now, deps) {
  if (!deps.isWebsocketRecoveryError(error)) return false;
  state.websocketRecoveryStartedAt ??= now();
  return deps.waitForWebsocketRetry(
    state.websocketRecoveryStartedAt,
    state.websocketRecoveryAttempts,
  );
}
