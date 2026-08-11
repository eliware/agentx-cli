export const WEBSOCKET_RECOVERY_WINDOW_MS = 10_000;
const WEBSOCKET_RECOVERY_INITIAL_DELAY_MS = 250;
const WEBSOCKET_RECOVERY_MAX_DELAY_MS = 2_000;

export function websocketRecoveryDelay(attempt) {
  return Math.min(WEBSOCKET_RECOVERY_INITIAL_DELAY_MS * (2 ** attempt), WEBSOCKET_RECOVERY_MAX_DELAY_MS);
}

export async function waitForWebsocketRetry(startedAt, attempt, now = Date.now(), sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))) {
  const delay = websocketRecoveryDelay(attempt);
  if (now - startedAt + delay >= WEBSOCKET_RECOVERY_WINDOW_MS) return false;
  await sleep(delay);
  return true;
}

export async function recreateOpenAIClient(current, createClient) {
  try { await current?.responses?.close?.(); } catch { /* stale transport cleanup is best effort */ }
  return createClient();
}
