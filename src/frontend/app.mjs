const STORAGE_KEY = 'agentx.gui.credentials';

function getStorage(storage) {
  try {
    return storage ?? null;
  } catch {
    return null;
  }
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
  }));
}

export function clearCredentials(storage = globalThis.localStorage) {
  const store = getStorage(storage);
  if (!store) return;
  store.removeItem(STORAGE_KEY);
}

function makeStatusText(state) {
  if (state.loggedOut) return 'logged out';
  if (state.authenticated && state.socketState === 'connected') return `connected as ${state.username}`;
  if (state.authenticated && state.socketState === 'connecting') return 'connecting websocket';
  if (state.authenticated && state.socketState === 'reconnecting') return 'reconnecting';
  if (state.authenticated) return 'authenticated';
  return 'signed out';
}

function appendLine(listEl, text) {
  if (!listEl) return;
  const item = listEl.ownerDocument.createElement('li');
  item.textContent = text;
  listEl.appendChild(item);
}

function buildWebSocketUrl(windowObj, token) {
  const protocol = windowObj.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${windowObj.location.host}/ws?token=${encodeURIComponent(token)}`;
}

export function createFrontendApp({
  document = globalThis.document,
  window = globalThis.window,
  fetch = globalThis.fetch,
  storage = globalThis.localStorage,
  WebSocketImpl = globalThis.WebSocket,
} = {}) {
  if (!document || !window || !fetch || !WebSocketImpl) {
    return null;
  }

  const form = document.querySelector('[data-login-form]');
  const usernameInput = document.querySelector('[data-login-username]');
  const passwordInput = document.querySelector('[data-login-password]');
  const rememberInput = document.querySelector('[data-login-remember]');
  const loginButton = document.querySelector('[data-login-button]');
  const logoutButton = document.querySelector('[data-logout-button]');
  const statusEl = document.querySelector('[data-status]');
  const detailEl = document.querySelector('[data-detail]');
  const messagesEl = document.querySelector('[data-messages]');
  const wsStateEl = document.querySelector('[data-ws-state]');

  const state = {
    auth: null,
    credentials: null,
    socket: null,
    reconnectTimer: null,
    reconnectDelay: 1000,
    manualLogout: false,
    loggedOut: false,
    replacingSocket: false,
  };

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setDetail(text) {
    if (detailEl) detailEl.textContent = text;
  }

  function setWsState(text) {
    if (wsStateEl) wsStateEl.textContent = text;
  }

  function refreshUi() {
    setStatus(makeStatusText({
      loggedOut: state.loggedOut,
      authenticated: Boolean(state.auth),
      socketState: state.socket ? state.socket.readyState === (typeof WebSocketImpl.OPEN === 'number' ? WebSocketImpl.OPEN : 1) ? 'connected' : 'connecting' : (state.auth ? 'disconnected' : 'idle'),
      username: state.auth?.username,
    }));
    if (logoutButton) logoutButton.disabled = !state.auth;
    if (loginButton) loginButton.disabled = false;
    setWsState(state.socket ? 'open' : (state.auth ? 'closed' : 'idle'));
  }

  function disconnectSocket() {
    const socket = state.socket;
    state.socket = null;
    if (socket) {
      state.replacingSocket = true;
      try {
        socket.close(1000, 'client disconnect');
      } catch {
        state.replacingSocket = false;
        // ignore
      }
    }
  }

  function clearReconnect() {
    if (state.reconnectTimer) {
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    clearReconnect();
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      if (!state.credentials || state.manualLogout) return;
      login(state.credentials, { autoReconnect: true }).catch((error) => {
        setDetail(error?.message || 'Reconnect failed');
        scheduleReconnect();
      });
    }, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 2, 10_000);
    setWsState('reconnecting');
    refreshUi();
  }

  function attachSocket(token) {
    if (state.socket) {
      disconnectSocket();
    }
    const socket = new WebSocketImpl(buildWebSocketUrl(window, token));
    state.socket = socket;
    state.reconnectDelay = 1000;
    setWsState('connecting');
    refreshUi();

    const on = socket.addEventListener?.bind(socket) || socket.on?.bind(socket);
    if (!on) {
      throw new Error('WebSocket implementation does not support event listeners');
    }

    on('open', () => {
      setWsState('open');
      refreshUi();
    });

    on('message', (event) => {
      const data = typeof event?.data === 'string' ? event.data : String(event?.data ?? '');
      appendLine(messagesEl, data);
      setDetail(data);
    });

    on('close', (event) => {
      state.socket = null;
      const replacing = state.replacingSocket;
      state.replacingSocket = false;
      setWsState(`closed${event?.code ? ` (${event.code})` : ''}`);
      refreshUi();
      if (replacing) {
        return;
      }
      if (state.manualLogout) {
        state.loggedOut = true;
        setStatus('logged out');
        setDetail('');
        return;
      }
      if (state.credentials) {
        scheduleReconnect();
      }
    });

    on('error', () => {
      setWsState('error');
      refreshUi();
    });
  }

  async function requestToken(credentials) {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Login failed');
    }
    return data;
  }

  async function login(credentials, { autoReconnect = false } = {}) {
    clearReconnect();
    state.manualLogout = false;
    state.loggedOut = false;
    state.credentials = {
      username: String(credentials.username || '').trim(),
      password: String(credentials.password || ''),
      remember: Boolean(credentials.remember),
    };

    if (state.credentials.remember) {
      saveCredentials(storage, state.credentials);
    } else {
      clearCredentials(storage);
    }

    setStatus(autoReconnect ? 'reconnecting' : 'authenticating');
    setDetail('');
    const data = await requestToken(state.credentials);
    state.auth = data;
    state.loggedOut = false;
    attachSocket(data.token);
    refreshUi();
    return data;
  }

  function logout() {
    state.manualLogout = true;
    state.loggedOut = true;
    state.replacingSocket = false;
    state.credentials = null;
    state.auth = null;
    clearReconnect();
    clearCredentials(storage);
    disconnectSocket();
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (rememberInput) rememberInput.checked = false;
    setStatus('logged out');
    setDetail('');
    refreshUi();
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    login({
      username: usernameInput?.value || '',
      password: passwordInput?.value || '',
      remember: Boolean(rememberInput?.checked),
    }).catch((error) => {
      setStatus('login failed');
      setDetail(error?.message || 'Login failed');
      refreshUi();
    });
  });

  logoutButton?.addEventListener('click', () => {
    logout();
  });

  const savedCredentials = loadStoredCredentials(storage);
  if (savedCredentials) {
    if (usernameInput) usernameInput.value = savedCredentials.username;
    if (passwordInput) passwordInput.value = savedCredentials.password;
    if (rememberInput) rememberInput.checked = true;
    login(savedCredentials, { autoReconnect: false }).catch((error) => {
      setStatus('auto-login failed');
      setDetail(error?.message || 'Auto-login failed');
      refreshUi();
    });
  } else {
    setStatus('signed out');
    setDetail('');
    refreshUi();
  }

  return {
    state,
    login,
    logout,
    refreshUi,
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  createFrontendApp();
}
