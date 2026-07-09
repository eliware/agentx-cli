const STORAGE_KEY = 'agentx.gui.credentials';

function getStorage(storage) {
  return storage ?? null;
}

export function loadStoredCredentials(storage = globalThis.localStorage) {
  const store = getStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.username || !parsed?.password) return null;
    return {
      username: String(parsed.username),
      password: String(parsed.password),
      remember: parsed.remember !== false,
      autologin: Boolean(parsed.autologin),
    };
  } catch {
    return null;
  }
}

export function saveCredentials(storage = globalThis.localStorage, credentials) {
  const store = getStorage(storage);
  if (!store || !credentials?.remember) return;
  store.setItem(STORAGE_KEY, JSON.stringify({
    username: credentials.username,
    password: credentials.password,
    remember: true,
    autologin: Boolean(credentials.autologin),
  }));
}

export function clearCredentials(storage = globalThis.localStorage) {
  const store = getStorage(storage);
  if (!store) return;
  store.removeItem(STORAGE_KEY);
}
