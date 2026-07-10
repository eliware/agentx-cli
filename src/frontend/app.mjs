import { clearCredentials, loadStoredCredentials, saveCredentials } from './credentials.mjs';
import { clearStoredSession, loadStoredSession, normalizeSessionState, saveStoredSession } from './session-storage.mjs';
import { buildWebSocketUrl } from './websocket.mjs';
import { queryFrontendElements } from './dom.mjs';
import { createTranscriptController } from './transcript.mjs';
import { fillLoginForm, renderHeader, setScreen, syncStatus } from './view.mjs';

export { clearCredentials, loadStoredCredentials, saveCredentials } from './credentials.mjs';
export { clearStoredSession, loadStoredSession, saveStoredSession } from './session-storage.mjs';

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

  const ui = queryFrontendElements(document);
  const transcript = createTranscriptController({ document, transcriptEl: ui.transcriptEl });
  const openState = typeof WebSocketImpl.OPEN === 'number' ? WebSocketImpl.OPEN : 1;

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
    session: normalizeSessionState(loadStoredSession(storage) || {}),
  };

  function setStatus(text) {
    if (ui.statusEl) ui.statusEl.textContent = text;
  }

  function setWsStatus(text) {
    if (ui.wsStatusEl) ui.wsStatusEl.textContent = text;
  }

  function refreshUi() {
    const socketState = getSocketState();
    if (state.forcedScreen === 'session' && !state.auth) {
      setStatus('authenticating');
      setWsStatus(socketState === 'reconnecting' ? 'reconnecting' : 'authenticating');
    } else {
      syncStatus(ui, {
        loggedOut: state.loggedOut,
        authenticated: Boolean(state.auth),
        socketState,
      });
    }
    if (ui.loginButton) ui.loginButton.disabled = false;
    if (ui.sendButton) ui.sendButton.disabled = !state.auth;
    if (ui.clearButton) ui.clearButton.disabled = !state.auth;
    if (ui.shellButton) ui.shellButton.disabled = true;
    if (ui.resumeButton) ui.resumeButton.disabled = !state.session.response_id;
    if (ui.sessionLogoutButton) ui.sessionLogoutButton.disabled = !state.auth;
    setScreen(ui, state.forcedScreen || (state.auth ? 'session' : 'login'));
    renderHeader(ui, state.session, state.auth);
  }

  function getSocketState() {
    if (!state.socket) {
      if (state.reconnecting && state.auth) return 'reconnecting';
      return state.auth ? 'disconnected' : 'idle';
    }
    return state.socket.readyState === openState ? 'connected' : 'connecting';
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
      if (!state.socket || state.socket.readyState !== openState) return;
      try {
        state.socket.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // Ignore keepalive send failures.
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

  function updateStoredSession(nextState) {
    state.session = normalizeSessionState({ ...state.session, ...nextState });
    saveStoredSession(storage, state.session);
    renderHeader(ui, state.session, state.auth);
    if (ui.resumeButton) ui.resumeButton.disabled = !state.session.response_id;
  }

  function handleOpenAIEvent(event) {
    transcript.handleOpenAIEvent(event);
  }

  function handleSocketMessage(raw) {
    let payload;
    try {
      payload = JSON.parse(String(raw));
    } catch {
      return;
    }

    switch (payload?.type) {
      case 'connected':
        setWsStatus('connected');
        startKeepalive();
        break;
      case 'pong':
        break;
      case 'chat.ack':
        if (ui.assistantStatusEl) ui.assistantStatusEl.textContent = 'thinking';
        break;
      case 'session.state':
        updateStoredSession(payload.state || {});
        break;
      case 'assistant.complete':
        if (payload.text) transcript.finalizeAssistant(payload.text);
        updateStoredSession(payload.state || {});
        if (ui.assistantStatusEl) ui.assistantStatusEl.textContent = 'ready';
        break;
      case 'tool.start':
        transcript.beginToolEntry(String(payload.call_id || 'call'), payload.call);
        break;
      case 'tool.output':
      case 'tool.done':
        transcript.updateToolEntry(String(payload.call_id || 'call'), payload);
        break;
      case 'openai.event':
        handleOpenAIEvent(payload.event);
        break;
      case 'error':
        setWsStatus(payload.error || 'error');
        if (ui.assistantStatusEl) ui.assistantStatusEl.textContent = 'error';
        break;
      default:
        break;
    }
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
      const snapshot = loadStoredSession(storage) || state.session;
      socket.send(JSON.stringify({ type: 'session.sync', state: snapshot }));
    });

    on('message', (event) => {
      const data = typeof event?.data === 'string' ? event.data : String(event?.data ?? event ?? '');
      handleSocketMessage(data);
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

  function showSavedLoginForm() {
    const saved = loadStoredCredentials(storage);
    if (saved) {
      fillLoginForm(ui, saved);
    } else {
      fillLoginForm(ui, { username: '', password: '', remember: false, autologin: false });
    }
    state.forcedScreen = 'login';
    setScreen(ui, 'login');
    setStatus('signed out');
    setWsStatus('signed out');
    refreshUi();
  }

  function sendCurrentMessage() {
    if (!state.socket || state.socket.readyState !== openState) {
      setWsStatus('not connected');
      return;
    }
    const text = String(ui.composerInput?.value || '').trim();
    if (!text) return;
    transcript.appendUserMessage(text);
    if (ui.composerInput) ui.composerInput.value = '';
    state.socket.send(JSON.stringify({
      type: 'chat.message',
      text,
      state: loadStoredSession(storage) || state.session,
    }));
    if (ui.assistantStatusEl) ui.assistantStatusEl.textContent = 'thinking';
  }

  function clearSession() {
    clearStoredSession(storage);
    state.session = normalizeSessionState({ cwd: state.session.cwd });
    transcript.reset();
    renderHeader(ui, state.session, state.auth);
    if (ui.resumeButton) ui.resumeButton.disabled = true;
    if (state.socket && state.socket.readyState === openState) {
      state.socket.send(JSON.stringify({ type: 'session.clear' }));
    }
    if (ui.assistantStatusEl) ui.assistantStatusEl.textContent = 'ready';
  }

  function resumeSession() {
    if (!state.session.response_id) return;
    updateStoredSession(loadStoredSession(storage) || state.session);
    if (ui.sessionBannerEl) ui.sessionBannerEl.textContent = `Resume available for response ${state.session.response_id}`;
  }

  ui.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    login({
      username: ui.usernameInput?.value || '',
      password: ui.passwordInput?.value || '',
      remember: Boolean(ui.rememberInput?.checked),
      autologin: Boolean(ui.autologinInput?.checked),
    }).catch((error) => {
      state.forcedScreen = 'login';
      setStatus('login failed');
      setWsStatus(error?.message || 'Login failed');
      setScreen(ui, 'login');
    });
  });

  ui.composerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    sendCurrentMessage();
  });

  ui.composerInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendCurrentMessage();
    }
  });

  ui.clearButton?.addEventListener('click', () => clearSession());
  ui.resumeButton?.addEventListener('click', () => resumeSession());
  ui.sessionLogoutButton?.addEventListener('click', () => logout());

  ui.rememberInput?.addEventListener('change', () => {
    if (ui.rememberInput.checked) return;
    clearCredentials(storage);
    if (ui.usernameInput) ui.usernameInput.value = '';
    if (ui.passwordInput) ui.passwordInput.value = '';
    if (ui.autologinInput) ui.autologinInput.checked = false;
  });

  const savedCredentials = loadStoredCredentials(storage);
  if (savedCredentials) {
    fillLoginForm(ui, savedCredentials);
    if (savedCredentials.autologin) {
      state.forcedScreen = 'session';
      setScreen(ui, 'session');
      setStatus('authenticating');
      setWsStatus('authenticating');
      login(savedCredentials, { autoReconnect: false }).catch((error) => {
        state.forcedScreen = 'login';
        setStatus('auto-login failed');
        setWsStatus(error?.message || 'Auto-login failed');
        setScreen(ui, 'login');
      });
    } else {
      state.forcedScreen = 'login';
      setStatus('signed out');
      setWsStatus('signed out');
      refreshUi();
    }
  } else {
    fillLoginForm(ui, { username: '', password: '', remember: false, autologin: false });
    state.forcedScreen = 'login';
    setStatus('signed out');
    setWsStatus('signed out');
    refreshUi();
  }

  transcript.reset();
  if (state.session.last_user_message) {
    transcript.appendUserMessage(state.session.last_user_message);
  }
  if (state.session.last_assistant_message) {
    transcript.finalizeAssistant(state.session.last_assistant_message);
  }

  return {
    state,
    login,
    logout,
    refreshUi,
    clearSession,
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  createFrontendApp();
}
