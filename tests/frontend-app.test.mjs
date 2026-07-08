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
  const form = new FakeElement('form');
  const username = new FakeElement('input');
  const password = new FakeElement('input');
  const remember = new FakeElement('input');
  const loginButton = new FakeElement('button');
  const logoutButton = new FakeElement('button');
  const status = new FakeElement('span');
  const detail = new FakeElement('span');
  const wsState = new FakeElement('span');
  const messages = new FakeElement('ul');
  const elements = new Map([
    ['[data-login-form]', form],
    ['[data-login-username]', username],
    ['[data-login-password]', password],
    ['[data-login-remember]', remember],
    ['[data-login-button]', loginButton],
    ['[data-logout-button]', logoutButton],
    ['[data-status]', status],
    ['[data-detail]', detail],
    ['[data-ws-state]', wsState],
    ['[data-messages]', messages],
  ]);
  const document = new FakeDocument(elements);
  messages.ownerDocument = document;
  return { form, username, password, remember, loginButton, logoutButton, status, detail, wsState, messages, document };
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

  test('auto-logs in from local storage and opens a websocket with the issued token', async () => {
    FakeWebSocket.instances = [];
    const storage = new FakeStorage();
    const creds = { username: 'root', password: 'secret', remember: true };
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
      },
      fetch,
      storage,
      WebSocketImpl: FakeWebSocket,
    });

    await flush();
    expect(fetch).toHaveBeenCalledWith('/api/login', expect.objectContaining({ method: 'POST' }));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain('/ws?token=token-123');
    expect(env.username.value).toBe('root');
    expect(env.password.value).toBe('secret');
    expect(env.remember.checked).toBe(true);
    expect(env.status.textContent).toBe('connecting websocket');

    FakeWebSocket.instances[0].emit('open');
    expect(env.status.textContent).toBe('connected as root');

    FakeWebSocket.instances[0].emit('message', { data: '{"type":"connected","username":"root"}' });
    expect(env.messages.children).toHaveLength(1);
    expect(env.detail.textContent).toContain('connected');

    env.logoutButton.dispatch('click');
    expect(app.state.auth).toBeNull();
    expect(storage.getItem('agentx.gui.credentials')).toBeNull();
    expect(FakeWebSocket.instances[0].closeCalls[0]).toMatchObject({ code: 1000 });
    expect(env.status.textContent).toBe('logged out');
  });

  test('submits manual login requests and stores credentials when requested', async () => {
    FakeWebSocket.instances = [];
    const storage = new FakeStorage();
    const env = buildEnvironment();
    env.username.value = 'alice';
    env.password.value = 'hunter2';
    env.remember.checked = true;

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
      },
      fetch,
      storage,
      WebSocketImpl: FakeWebSocket,
    });

    env.form.dispatch('submit', { preventDefault() {} });
    await Promise.resolve();
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(storage.getItem('agentx.gui.credentials')).toContain('alice');
    expect(FakeWebSocket.instances[0].url).toContain('token-456');
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
      },
      fetch: loginFetch,
      storage: new FakeStorage(),
      WebSocketImpl: FakeWebSocket,
    });

    env.form.dispatch('submit', { preventDefault() {} });
    await Promise.resolve();
    await flush();
    expect(env.status.textContent).toBe('signed out');
    expect(env.detail.textContent).toBe('network down');

    const autologinStorage = new FakeStorage();
    autologinStorage.setItem('agentx.gui.credentials', JSON.stringify({ username: 'root', password: 'secret', remember: true }));
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
      },
      fetch: failingFetch,
      storage: autologinStorage,
      WebSocketImpl: FakeWebSocket,
    });
    await flush();
    expect(env2.status.textContent).toBe('signed out');
    expect(env2.detail.textContent).toBe('denied');
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
        },
        fetch,
        storage,
        WebSocketImpl: FakeWebSocketOnOnly,
      });

      await app.login({ username: 'root', password: 'secret', remember: false });
      expect(FakeWebSocketOnOnly.instances[0].url).toContain('wss://example.test/ws?token=token-a');

      FakeWebSocketOnOnly.instances[0].listeners.get('close')?.({ code: 1006 });
      expect(env.wsState.textContent).toBe('closed');

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
      },
      fetch,
      storage: new FakeStorage(),
      WebSocketImpl: FakeWebSocketNoListeners,
    });

    await expect(app.login({ username: 'root', password: 'secret', remember: false })).rejects.toThrow('WebSocket implementation does not support event listeners');
  });
});
