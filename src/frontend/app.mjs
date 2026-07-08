import { clearCredentials, loadStoredCredentials, saveCredentials } from './credentials.mjs';
import { clearStoredSession, loadStoredSession, saveStoredSession } from './session-storage.mjs';
import { makeStatusText } from './status.mjs';
import { buildWebSocketUrl } from './websocket.mjs';
import { queryFrontendElements } from './dom.mjs';

export { clearCredentials, loadStoredCredentials, saveCredentials } from './credentials.mjs';
export { clearStoredSession, loadStoredSession, saveStoredSession } from './session-storage.mjs';

const KEEPALIVE_MS = 45_000;

function normalizeSessionState(state = {}) {
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

function formatUsage(state) {
  const usage = state?.usage || {};
  return `${Number(usage.inputTokens ?? 0)} in / ${Number(usage.outputTokens ?? 0)} out / ${Number(usage.turns ?? 0)} turns`;
}

function makeTranscriptNode(document, role, title, bodyText = '') {
  const item = document.createElement('article');
  item.className = `chat-item chat-item--${role}`;

  const header = document.createElement('header');
  header.className = 'chat-item__header';
  header.textContent = title;

  const body = document.createElement('pre');
  body.className = 'chat-item__body';
  body.textContent = bodyText;

  item.append(header, body);
  return { item, body };
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
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

  const ui = queryFrontendElements(document);
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
    assistantEntry: null,
    toolEntries: new Map(),
    currentAssistantText: '',
    currentToolArgs: new Map(),
  };

  function setStatus(text) {
    if (ui.statusEl) ui.statusEl.textContent = text;
  }

  function setWsStatus(text) {
    if (ui.wsStatusEl) ui.wsStatusEl.textContent = text;
  }

  function setScreen(screen) {
    if (ui.loginScreenEl) ui.loginScreenEl.hidden = screen !== 'login';
    if (ui.sessionScreenEl) ui.sessionScreenEl.hidden = screen !== 'session';
  }

  function renderHeader() {
    if (ui.cwdEl) ui.cwdEl.textContent = state.session.cwd || 'cwd unset';
    if (ui.responseIdEl) ui.responseIdEl.textContent = state.session.response_id || 'no response id';
    if (ui.usageEl) ui.usageEl.textContent = formatUsage(state.session);
    if (ui.summaryEl) ui.summaryEl.textContent = state.session.last_assistant_message || 'Ready for a new turn.';
    if (ui.sessionBannerEl) {
      const hasResume = Boolean(state.session.response_id);
      ui.sessionBannerEl.hidden = !hasResume;
      ui.sessionBannerEl.textContent = hasResume
        ? `Resume available for response ${state.session.response_id}`
        : 'Fresh session';
    }
    if (ui.inspectorEl) {
      ui.inspectorEl.textContent = safeJson({
        auth: state.auth ? { username: state.auth.username, expiresAt: state.auth.expiresAt } : null,
        session: state.session,
      });
    }
    if (ui.sessionListEl && ui.sessionListEl.children.length === 0) {
      const items = [
        'Current conversation',
        'Pinned tools',
        'Recent cwd',
        'LocalStorage state',
      ];
      items.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        ui.sessionListEl.appendChild(li);
      });
    }
  }

  function resetTranscript() {
    if (ui.transcriptEl) ui.transcriptEl.innerHTML = '';
    state.assistantEntry = null;
    state.toolEntries.clear();
    state.currentAssistantText = '';
    state.currentToolArgs.clear();
  }

  function fillLoginForm(credentials) {
    if (ui.usernameInput) ui.usernameInput.value = credentials?.username || '';
    if (ui.passwordInput) ui.passwordInput.value = credentials?.password || '';
    if (ui.rememberInput) ui.rememberInput.checked = Boolean(credentials?.remember);
    if (ui.autologinInput) ui.autologinInput.checked = Boolean(credentials?.autologin);
  }

  function getSocketState() {
    if (!state.socket) {
      if (state.reconnecting && state.auth) return 'reconnecting';
      return state.auth ? 'disconnected' : 'idle';
    }
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
    if (ui.loginButton) ui.loginButton.disabled = false;
    if (ui.sendButton) ui.sendButton.disabled = !state.auth;
    if (ui.clearButton) ui.clearButton.disabled = !state.auth;
    if (ui.shellButton) ui.shellButton.disabled = true;
    if (ui.resumeButton) ui.resumeButton.disabled = !state.session.response_id;
    if (ui.sessionLogoutButton) ui.sessionLogoutButton.disabled = !state.auth;
    setScreen(state.forcedScreen || (state.auth ? 'session' : 'login'));
    renderHeader();
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
    renderHeader();
    if (ui.resumeButton) ui.resumeButton.disabled = !state.session.response_id;
  }

  function ensureAssistantEntry() {
    if (state.assistantEntry) return state.assistantEntry;
    if (!ui.transcriptEl) return null;
    const node = makeTranscriptNode(document, 'assistant', 'Assistant', '');
    state.assistantEntry = node;
    ui.transcriptEl.appendChild(node.item);
    node.item.scrollIntoView?.({ block: 'end' });
    return node;
  }

  function ensureToolEntry(callId, title = 'Tool call') {
    if (state.toolEntries.has(callId)) return state.toolEntries.get(callId);
    if (!ui.transcriptEl) return null;
    const node = makeTranscriptNode(document, 'tool', title, '');
    node.item.dataset.callId = callId;
    state.toolEntries.set(callId, node);
    ui.transcriptEl.appendChild(node.item);
    node.item.scrollIntoView?.({ block: 'end' });
    return node;
  }

  function appendUserMessage(text) {
    if (!ui.transcriptEl) return;
    const node = makeTranscriptNode(document, 'user', 'You', text);
    ui.transcriptEl.appendChild(node.item);
    node.item.scrollIntoView?.({ block: 'end' });
  }

  function appendAssistantDelta(delta) {
    const node = ensureAssistantEntry();
    if (!node) return;
    state.currentAssistantText += String(delta ?? '');
    node.body.textContent = state.currentAssistantText;
    node.item.scrollIntoView?.({ block: 'end' });
  }

  function finalizeAssistant(text) {
    const node = ensureAssistantEntry();
    if (!node) return;
    if (text) node.body.textContent = String(text);
    node.item.dataset.complete = 'true';
    node.item.scrollIntoView?.({ block: 'end' });
  }

  function updateToolEntry(callId, payload) {
    const node = ensureToolEntry(callId, payload?.title || 'Tool call');
    if (!node) return;
    const body = {
      call: payload?.call || null,
      output: payload?.output || null,
    };
    node.body.textContent = safeJson(body);
    node.item.scrollIntoView?.({ block: 'end' });
  }

  function beginToolEntry(callId, call) {
    const title = call?.name === 'shell_call' || call?.type === 'shell_call'
      ? 'shell_call'
      : call?.name || call?.type || 'tool';
    const node = ensureToolEntry(callId, title);
    if (!node) return;
    node.body.textContent = safeJson({ call, status: 'running' });
  }

  function handleOpenAIEvent(event) {
    if (!event || typeof event !== 'object') return;

    if (event.type === 'response.created') {
      state.currentAssistantText = '';
      state.assistantEntry = null;
      return;
    }

    if (event.type === 'response.output_text.delta') {
      appendAssistantDelta(event.delta);
      return;
    }

    if (event.type === 'response.output_item.added') {
      const item = event.item;
      if (item?.type === 'shell_call' || item?.type === 'function_call') {
        const callId = String(item.call_id || item.id || `call-${Date.now()}`);
        beginToolEntry(callId, item);
      }
      return;
    }

    if (event.type === 'response.function_call_arguments.delta') {
      const callId = String(event.call_id || event.item_id || 'call');
      const existing = state.currentToolArgs.get(callId) || '';
      const next = `${existing}${String(event.delta ?? '')}`;
      state.currentToolArgs.set(callId, next);
      const node = ensureToolEntry(callId, 'function_call');
      if (node) {
        node.body.textContent = next;
      }
      return;
    }

    if (event.type === 'response.output_item.done') {
      const item = event.item;
      if (item?.type === 'message') {
        finalizeAssistant(state.currentAssistantText || extractAssistantText(item));
      }
      return;
    }

    if (event.type === 'response.completed') {
      finalizeAssistant(state.currentAssistantText || extractAssistantText(event.response));
      return;
    }
  }

  function extractAssistantText(response) {
    const parts = [];
    for (const item of response?.output ?? []) {
      if (item?.type !== 'message') continue;
      for (const content of item.content ?? []) {
        if (content?.type === 'output_text' && content.text) parts.push(String(content.text));
      }
    }
    return parts.join('\n');
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
        if (payload.text) finalizeAssistant(payload.text);
        updateStoredSession(payload.state || {});
        if (ui.assistantStatusEl) ui.assistantStatusEl.textContent = 'ready';
        break;
      case 'tool.start':
        beginToolEntry(String(payload.call_id || 'call'), payload.call);
        break;
      case 'tool.output':
        updateToolEntry(String(payload.call_id || 'call'), payload);
        break;
      case 'tool.done':
        updateToolEntry(String(payload.call_id || 'call'), payload);
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

  function sendCurrentMessage() {
    if (!state.socket || state.socket.readyState !== openState) {
      setWsStatus('not connected');
      return;
    }
    const text = String(ui.composerInput?.value || '').trim();
    if (!text) return;
    appendUserMessage(text);
    state.currentAssistantText = '';
    state.assistantEntry = null;
    state.currentToolArgs.clear();
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
    resetTranscript();
    renderHeader();
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
      setScreen('login');
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

  resetTranscript();
  if (state.session.last_user_message) {
    appendUserMessage(state.session.last_user_message);
  }
  if (state.session.last_assistant_message) {
    finalizeAssistant(state.session.last_assistant_message);
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
