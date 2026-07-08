import { clearCredentials, loadStoredCredentials, saveCredentials } from './credentials.mjs';
import { makeStatusText } from './status.mjs';
import { buildWebSocketUrl } from './websocket.mjs';
import { queryFrontendElements } from './dom.mjs';

export { clearCredentials, loadStoredCredentials, saveCredentials } from './credentials.mjs';

const KEEPALIVE_MS = 45_000;

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

  const {
    loginScreenEl,
    sessionScreenEl,
    form,
    usernameInput,
    passwordInput,
    rememberInput,
    autologinInput,
    loginButton,
    sessionLogoutButton,
    statusEl,
    wsStatusEl,
  } = queryFrontendElements(document);

  const state = {
    auth: null,
    credentials: null,
    socket: null,
    reconnectTimer: null,
    reconnectDelay: 1000,
    manualLogout: false,
    loggedOut: false,
    replacingSocket: false,
    reconnecting: false,
    keepaliveTimer: null,
    forcedScreen: null,
  };

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setWsStatus(text) {
    if (wsStatusEl) wsStatusEl.textContent = text;
  }

  function setScreen(screen) {
    if (loginScreenEl) loginScreenEl.hidden = screen !== 'login';
    if (sessionScreenEl) sessionScreenEl.hidden = screen !== 'session';
  }

  function fillLoginForm(credentials) {
    if (usernameInput) usernameInput.value = credentials?.username || '';
    if (passwordInput) passwordInput.value = credentials?.password || '';
    if (rememberInput) rememberInput.checked = Boolean(credentials?.remember);
    if (autologinInput) autologinInput.checked = Boolean(credentials?.autologin);
  }

  function showSavedLoginForm() {
    const saved = loadStoredCredentials(storage);
    if (saved) {
      fillLoginForm(saved);
    } else {
      fillLoginForm({ username: '', password: '', remember: false, autologin: false });
    }
    state.forcedScreen = 'login';
    setScreen('login');
    setStatus('signed out');
    setWsStatus('signed out');
    refreshUi();
  }

  function getSocketState() {
    if (!state.socket) {
      if (state.reconnecting && state.auth) return 'reconnecting';
      return state.auth ? 'disconnected' : 'idle';
    }
    const openState = typeof WebSocketImpl.OPEN === 'number' ? WebSocketImpl.OPEN : 1;
    return state.socket.readyState === openState ? 'connected' : 'connecting';
  }

  function refreshUi() {
    const socketState = getSocketState();
    if (state.forcedScreen === 'session' && !state.auth) {
      setStatus('authenticating');
      setWsStatus(socketState === 'reconnecting' ? 'reconnecting' : 'authenticating');
    } else {
      setStatus(makeStatusText({
        loggedOut: state.loggedOut,
        authenticated: Boolean(state.auth),
        socketState,
      }));
      setWsStatus(makeStatusText({
        authenticated: Boolean(state.auth),
        socketState,
      }));
    }
    if (loginButton) loginButton.disabled = false;
    if (sessionLogoutButton) sessionLogoutButton.disabled = !state.auth;
    setScreen(state.forcedScreen || (state.auth ? 'session' : 'login'));
  }

  function clearKeepalive() {
    if (state.keepaliveTimer) {
      window.clearInterval(state.keepaliveTimer);
      state.keepaliveTimer = null;
    }
  }

  function startKeepalive() {
    clearKeepalive();
    state.keepaliveTimer = window.setInterval(() => {
      const openState = typeof WebSocketImpl.OPEN === 'number' ? WebSocketImpl.OPEN : 1;
      if (!state.socket || state.socket.readyState !== openState) return;
      try {
        state.socket.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // Ignore keepalive send failures; close handling will recover.
      }
    }, KEEPALIVE_MS);
  }

  function disconnectSocket() {
    const socket = state.socket;
    state.socket = null;
    clearKeepalive();
    if (socket) {
      state.replacingSocket = true;
      try {
        socket.close(1000, 'client disconnect');
      } catch {
        state.replacingSocket = false;
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
    state.reconnecting = true;
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      if (!state.credentials || state.manualLogout) return;
      login(state.credentials, { autoReconnect: true }).catch(() => {
        setWsStatus('reconnecting');
        scheduleReconnect();
      });
    }, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 2, 10_000);
    setWsStatus('reconnecting');
    refreshUi();
  }

  function attachSocket(token) {
    if (state.socket) {
      disconnectSocket();
    }
    const socket = new WebSocketImpl(buildWebSocketUrl(window, token));
    state.socket = socket;
    state.reconnectDelay = 1000;
    state.reconnecting = false;
    setWsStatus('connecting websocket');
    refreshUi();

    const on = socket.addEventListener?.bind(socket) || socket.on?.bind(socket);
    if (!on) {
      throw new Error('WebSocket implementation does not support event listeners');
    }

    on('open', () => {
      state.reconnecting = false;
      setWsStatus('connected');
      startKeepalive();
      refreshUi();
    });

    on('close', (event) => {
      state.socket = null;
      clearKeepalive();
      const replacing = state.replacingSocket;
      state.replacingSocket = false;
      setWsStatus(`closed${event?.code ? ` (${event.code})` : ''}`);
      refreshUi();
      if (replacing) return;
      if (state.manualLogout) {
        state.loggedOut = true;
        setStatus('signed out');
        return;
      }
      if (state.credentials) {
        scheduleReconnect();
      }
    });

    on('error', () => {
      setWsStatus('error');
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
    state.reconnecting = false;
    state.loggedOut = false;
    state.credentials = {
      username: String(credentials.username || '').trim(),
      password: String(credentials.password || ''),
      remember: Boolean(credentials.remember),
      autologin: Boolean(credentials.autologin),
    };

    if (state.credentials.remember) {
      saveCredentials(storage, state.credentials);
    } else {
      clearCredentials(storage);
    }

    setStatus(autoReconnect ? 'reconnecting' : 'authenticating');
    const data = await requestToken(state.credentials);
    state.auth = data;
    state.forcedScreen = null;
    state.loggedOut = false;
    attachSocket(data.token);
    refreshUi();
    return data;
  }

  function logout() {
    state.manualLogout = true;
    state.reconnecting = false;
    state.loggedOut = true;
    state.forcedScreen = 'login';
    state.replacingSocket = false;
    state.credentials = null;
    state.auth = null;
    clearReconnect();
    clearKeepalive();
    disconnectSocket();
    showSavedLoginForm();
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    login({
      username: usernameInput?.value || '',
      password: passwordInput?.value || '',
      remember: Boolean(rememberInput?.checked),
      autologin: Boolean(autologinInput?.checked),
    }).catch((error) => {
      state.forcedScreen = 'login';
      setStatus('login failed');
      setWsStatus(error?.message || 'Login failed');
      setScreen('login');
    });
  });

  rememberInput?.addEventListener('change', () => {
    if (rememberInput.checked) return;
    clearCredentials(storage);
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (autologinInput) autologinInput.checked = false;
  });

  sessionLogoutButton?.addEventListener('click', () => {
    logout();
  });

  const savedCredentials = loadStoredCredentials(storage);
  if (savedCredentials) {
    fillLoginForm(savedCredentials);
    if (savedCredentials.autologin) {
      state.forcedScreen = 'session';
      setScreen('session');
      setStatus('authenticating');
      setWsStatus('authenticating');
      login(savedCredentials, { autoReconnect: false }).catch((error) => {
        state.forcedScreen = 'login';
        setStatus('auto-login failed');
        setWsStatus(error?.message || 'Auto-login failed');
        setScreen('login');
      });
    } else {
      state.forcedScreen = 'login';
      setStatus('signed out');
      setWsStatus('signed out');
      refreshUi();
    }
  } else {
    fillLoginForm({ username: '', password: '', remember: false, autologin: false });
    state.forcedScreen = 'login';
    setStatus('signed out');
    setWsStatus('signed out');
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
