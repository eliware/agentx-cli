import { describe, expect, jest, test } from '@jest/globals';
import { clearCredentials, createFrontendApp, loadStoredCredentials, saveCredentials } from '../src/frontend/app.mjs';

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.listeners = new Map();
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
  }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  dispatch(event, payload = {}) {
    const handler = this.listeners.get(event);
    if (handler) {
      return handler(payload);
    }
    return undefined;
  }
}

class FakeDocument {
  constructor(elements) {
    this.elements = elements;
  }

  querySelector(selector) {
    return this.elements.get(selector) || null;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

class FakeStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

class FakeWebSocket {
  static OPEN = 1;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.readyState = 0;
    this.closeCalls = [];
    this.sendCalls = [];
    const ctor = this.constructor;
    if (!Array.isArray(ctor.instances)) {
      ctor.instances = [];
    }
    ctor.instances.push(this);
  }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }

  close(code, reason) {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
    this.listeners.get('close')?.({ code, reason });
  }

  send(data) {
    this.sendCalls.push(data);
  }

  emit(event, payload) {
    if (event === 'open') this.readyState = 1;
    this.listeners.get(event)?.(payload);
  }
}

class FakeWebSocketOnOnly {
  static OPEN = 1;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.readyState = 0;
    this.closeCalls = [];
    this.sendCalls = [];
    FakeWebSocketOnOnly.instances.push(this);
  }

  on(event, handler) {
    this.listeners.set(event, handler);
  }

  close(code, reason) {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
    this.listeners.get('close')?.({ code, reason });
  }

  send(data) {
    this.sendCalls.push(data);
  }

  emit(event, payload) {
    if (event === 'open') this.readyState = 1;
    this.listeners.get(event)?.(payload);
  }
}

class FakeWebSocketNoListeners {
  constructor(url) {
    this.url = url;
  }
}

function buildEnvironment() {
  const loginScreen = new FakeElement('section');
  const sessionScreen = new FakeElement('section');
  const form = new FakeElement('form');
  const username = new FakeElement('input');
  const password = new FakeElement('input');
  const remember = new FakeElement('input');
  const autologin = new FakeElement('input');
  const loginButton = new FakeElement('button');
  const logoutButton = new FakeElement('button');
  const status = new FakeElement('span');
  const wsStatus = new FakeElement('span');
  const elements = new Map([
    ['[data-login-screen]', loginScreen],
    ['[data-session-screen]', sessionScreen],
    ['[data-login-form]', form],
    ['[data-login-username]', username],
    ['[data-login-password]', password],
    ['[data-login-remember]', remember],
    ['[data-login-autologin]', autologin],
    ['[data-login-button]', loginButton],
    ['[data-session-logout-button]', logoutButton],
    ['[data-status]', status],
    ['[data-ws-status]', wsStatus],
  ]);
  const document = new FakeDocument(elements);
  return { loginScreen, sessionScreen, form, username, password, remember, autologin, loginButton, logoutButton, status, wsStatus, document };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('frontend gui app', () => {
  test('handles missing environment and storage helpers', () => {
    expect(createFrontendApp({})).toBeNull();

    const storage = new FakeStorage();
    storage.setItem('agentx.gui.credentials', '{');
    expect(loadStoredCredentials(storage)).toBeNull();

    storage.setItem('agentx.gui.credentials', JSON.stringify({ username: 'root' }));
    expect(loadStoredCredentials(storage)).toBeNull();

    saveCredentials(storage, { username: 'root', password: 'secret', remember: false });
    expect(storage.getItem('agentx.gui.credentials')).not.toContain('secret');

    clearCredentials(undefined);
    clearCredentials(null);
  });

  test('auto-logs in from local storage, switches screens, and sends keepalive pings', async () => {
    jest.useFakeTimers();
    try {
      FakeWebSocket.instances = [];
      const storage = new FakeStorage();
      const creds = { username: 'root', password: 'secret', remember: true, autologin: true };
      saveCredentials(storage, creds);
      expect(loadStoredCredentials(storage)).toEqual(creds);

      const env = buildEnvironment();
      const fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, username: 'root', token: 'token-123', expiresAt: 1, ttlMs: 30000 }),
      });

      const app = createFrontendApp({
        document: env.document,
        window: {
          location: { protocol: 'http:', host: 'example.test' },
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
        },
        fetch,
        storage,
        WebSocketImpl: FakeWebSocket,
      });

      for (let i = 0; i < 6; i += 1) {
        await Promise.resolve();
      }
      expect(fetch).toHaveBeenCalledWith('/api/login', expect.objectContaining({ method: 'POST' }));
      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(FakeWebSocket.instances[0].url).toContain('/ws?token=token-123');
      expect(env.loginScreen.hidden).toBe(true);
      expect(env.sessionScreen.hidden).toBe(false);
      expect(env.username.value).toBe('root');
      expect(env.password.value).toBe('secret');
      expect(env.remember.checked).toBe(true);
      expect(env.autologin.checked).toBe(true);
      expect(env.wsStatus.textContent).toBe('connecting websocket');

      FakeWebSocket.instances[0].emit('open');
      expect(env.wsStatus.textContent).toBe('connected');

      await jest.advanceTimersByTimeAsync(45_000);
      expect(FakeWebSocket.instances[0].sendCalls[0]).toBe(JSON.stringify({ type: 'ping' }));

      env.logoutButton.dispatch('click');
      expect(app.state.auth).toBeNull();
      expect(storage.getItem('agentx.gui.credentials')).toContain('root');
      expect(FakeWebSocket.instances[0].closeCalls[0]).toMatchObject({ code: 1000 });
      expect(env.loginScreen.hidden).toBe(false);
      expect(env.sessionScreen.hidden).toBe(true);
      expect(env.username.value).toBe('root');
      expect(env.password.value).toBe('secret');
      expect(env.remember.checked).toBe(true);
      expect(env.autologin.checked).toBe(true);
      expect(env.status.textContent).toBe('signed out');
      expect(env.wsStatus.textContent).toBe('signed out');
    } finally {
      jest.useRealTimers();
    }
  });

  test('submits manual login requests and stores credentials when requested', async () => {
    FakeWebSocket.instances = [];
    const storage = new FakeStorage();
    const env = buildEnvironment();

    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, username: 'alice', token: 'token-456', expiresAt: 1, ttlMs: 30000 }),
    });

    createFrontendApp({
      document: env.document,
      window: {
        location: { protocol: 'http:', host: 'example.test' },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      },
      fetch,
      storage,
      WebSocketImpl: FakeWebSocket,
    });

    env.username.value = 'alice';
    env.password.value = 'hunter2';
    env.remember.checked = true;
    env.autologin.checked = false;

    env.form.dispatch('submit', { preventDefault() {} });
    await Promise.resolve();
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(storage.getItem('agentx.gui.credentials')).toContain('alice');
    expect(FakeWebSocket.instances[0].url).toContain('token-456');
    expect(env.loginScreen.hidden).toBe(true);
    expect(env.sessionScreen.hidden).toBe(false);
  });

  test('clearing remember me wipes stored credentials and form fields', async () => {
    const storage = new FakeStorage();
    const env = buildEnvironment();

    saveCredentials(storage, { username: 'alice', password: 'hunter2', remember: true, autologin: false });

    createFrontendApp({
      document: env.document,
      window: {
        location: { protocol: 'http:', host: 'example.test' },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      },
      fetch: jest.fn(),
      storage,
      WebSocketImpl: FakeWebSocket,
    });

    env.remember.checked = false;
    env.remember.dispatch('change');
    expect(storage.getItem('agentx.gui.credentials')).toBeNull();
    expect(env.username.value).toBe('');
    expect(env.password.value).toBe('');
    expect(env.autologin.checked).toBe(false);
  });

  test('reports login failures and auto-login failures', async () => {
    const env = buildEnvironment();
    const loginFetch = jest.fn().mockRejectedValue(new Error('network down'));

    createFrontendApp({
      document: env.document,
      window: {
        location: { protocol: 'http:', host: 'example.test' },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      },
      fetch: loginFetch,
      storage: new FakeStorage(),
      WebSocketImpl: FakeWebSocket,
    });

    env.form.dispatch('submit', { preventDefault() {} });
    await Promise.resolve();
    await flush();
    expect(env.loginScreen.hidden).toBe(false);
    expect(env.sessionScreen.hidden).toBe(true);
    expect(env.status.textContent).toBe('login failed');
    expect(env.wsStatus.textContent).toBe('network down');

    const autologinStorage = new FakeStorage();
    autologinStorage.setItem('agentx.gui.credentials', JSON.stringify({ username: 'root', password: 'secret', remember: true, autologin: true }));
    const failingFetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'denied' }),
    });
    const env2 = buildEnvironment();
    createFrontendApp({
      document: env2.document,
      window: {
        location: { protocol: 'http:', host: 'example.test' },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      },
      fetch: failingFetch,
      storage: autologinStorage,
      WebSocketImpl: FakeWebSocket,
    });
    await flush();
    expect(env2.loginScreen.hidden).toBe(false);
    expect(env2.sessionScreen.hidden).toBe(true);
    expect(env2.username.value).toBe('root');
    expect(env2.password.value).toBe('secret');
    expect(env2.remember.checked).toBe(true);
    expect(env2.autologin.checked).toBe(true);
    expect(env2.status.textContent).toBe('auto-login failed');
    expect(env2.wsStatus.textContent).toBe('denied');
  });

  test('reconnects on unexpected websocket close and uses the on() fallback', async () => {
    jest.useFakeTimers();
    try {
      FakeWebSocketOnOnly.instances = [];
      const env = buildEnvironment();
      const fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, username: 'root', token: 'token-a', expiresAt: 1, ttlMs: 30000 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, username: 'root', token: 'token-b', expiresAt: 1, ttlMs: 30000 }),
        });
      const storage = new FakeStorage();

      const app = createFrontendApp({
        document: env.document,
        window: {
          location: { protocol: 'https:', host: 'example.test' },
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
        },
        fetch,
        storage,
        WebSocketImpl: FakeWebSocketOnOnly,
      });

      await app.login({ username: 'root', password: 'secret', remember: false, autologin: false });
      expect(FakeWebSocketOnOnly.instances[0].url).toContain('wss://example.test/ws?token=token-a');
      expect(env.loginScreen.hidden).toBe(true);
      expect(env.sessionScreen.hidden).toBe(false);

      FakeWebSocketOnOnly.instances[0].listeners.get('close')?.({ code: 1006 });
      expect(env.wsStatus.textContent).toBe('reconnecting');

      await jest.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      await Promise.resolve();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(FakeWebSocketOnOnly.instances).toHaveLength(2);
      expect(FakeWebSocketOnOnly.instances[1].url).toContain('token-b');

      app.state.manualLogout = true;
      FakeWebSocketOnOnly.instances[1].listeners.get('close')?.({ code: 1006 });
      await jest.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      await Promise.resolve();
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('throws when a websocket implementation cannot register listeners', async () => {
    const env = buildEnvironment();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, username: 'root', token: 'token-789', expiresAt: 1, ttlMs: 30000 }),
    });

    const app = createFrontendApp({
      document: env.document,
      window: {
        location: { protocol: 'http:', host: 'example.test' },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      },
      fetch,
      storage: new FakeStorage(),
      WebSocketImpl: FakeWebSocketNoListeners,
    });

    await expect(app.login({ username: 'root', password: 'secret', remember: false, autologin: false })).rejects.toThrow('WebSocket implementation does not support event listeners');
  });
});
