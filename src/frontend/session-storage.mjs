const SESSION_STORAGE_KEY = 'agentx.gui.session';

function getStorage(storage) {
  try {
    return storage ?? null;
  } catch {
    return null;
  }
}

export function normalizeSessionState(state = {}) {
  return {
    response_id: String(state.response_id ?? ''),
    usage: {
      inputTokens: Number(state?.usage?.inputTokens ?? 0),
      cachedTokens: Number(state?.usage?.cachedTokens ?? 0),
      outputTokens: Number(state?.usage?.outputTokens ?? 0),
      turns: Number(state?.usage?.turns ?? 0),
    },
    last_user_message: String(state.last_user_message ?? ''),
    last_assistant_message: String(state.last_assistant_message ?? ''),
    pending_cli_transcript: String(state.pending_cli_transcript ?? ''),
    pending_tool_calls: Array.isArray(state.pending_tool_calls) ? state.pending_tool_calls : [],
    cwd: String(state.cwd ?? ''),
    updated_at: String(state.updated_at ?? ''),
  };
}

export function loadStoredSession(storage = globalThis.localStorage) {
  const store = getStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSessionState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredSession(storage = globalThis.localStorage, sessionState) {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalizeSessionState(sessionState)));
}

export function clearStoredSession(storage = globalThis.localStorage) {
  const store = getStorage(storage);
  if (!store) return;
  store.removeItem(SESSION_STORAGE_KEY);
}

export { SESSION_STORAGE_KEY };
