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
    FakeWebSocket.instances.push(this);
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
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(storage.getItem('agentx.gui.credentials')).toContain('alice');
    expect(FakeWebSocket.instances[0].url).toContain('token-456');
  });
});
