import { describe, expect, jest, test } from '@jest/globals';
import { clearCredentials, clearStoredSession, createFrontendApp, loadStoredCredentials, loadStoredSession, saveCredentials, saveStoredSession } from '../src/frontend/app.mjs';

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
    this.dataset = {};
    this.className = '';
  }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  dispatch(event, payload = {}) {
    const handler = this.listeners.get(event);
    if (handler) {
      return handler(payload);
    }
    return undefined;
  }

  scrollIntoView() {}
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
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
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

function buildEnvironment() {
  const selectors = [
    ['[data-login-screen]', new FakeElement('section')],
    ['[data-session-screen]', new FakeElement('section')],
    ['[data-login-form]', new FakeElement('form')],
    ['[data-login-username]', new FakeElement('input')],
    ['[data-login-password]', new FakeElement('input')],
    ['[data-login-remember]', new FakeElement('input')],
    ['[data-login-autologin]', new FakeElement('input')],
    ['[data-login-button]', new FakeElement('button')],
    ['[data-session-logout-button]', new FakeElement('button')],
    ['[data-status]', new FakeElement('span')],
    ['[data-ws-status]', new FakeElement('span')],
    ['[data-cwd]', new FakeElement('strong')],
    ['[data-response-id]', new FakeElement('strong')],
    ['[data-usage]', new FakeElement('strong')],
    ['[data-transcript]', new FakeElement('div')],
    ['[data-inspector]', new FakeElement('pre')],
    ['[data-session-banner]', new FakeElement('div')],
    ['[data-composer-form]', new FakeElement('form')],
    ['[data-composer-input]', new FakeElement('textarea')],
    ['[data-send-button]', new FakeElement('button')],
    ['[data-clear-button]', new FakeElement('button')],
    ['[data-shell-button]', new FakeElement('button')],
    ['[data-assistant-status]', new FakeElement('div')],
    ['[data-session-list]', new FakeElement('ul')],
    ['[data-tool-list]', new FakeElement('ul')],
    ['[data-summary]', new FakeElement('div')],
    ['[data-resume-button]', new FakeElement('button')],
  ];
  const elements = new Map(selectors);
  const document = new FakeDocument(elements);
  for (const element of elements.values()) {
    element.ownerDocument = document;
  }
  return { document, ...Object.fromEntries(elements) };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('frontend gui app', () => {
  let app = null;

  afterEach(() => {
    app?.logout?.();
    app = null;
    FakeWebSocket.instances = [];
  });

  test('stores credentials and sessions, then streams agent output into the transcript', async () => {
    FakeWebSocket.instances = [];
    const storage = new FakeStorage();
    const env = buildEnvironment();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, username: 'root', token: 'token-123', expiresAt: 123, ttlMs: 30000 }),
    });

    saveCredentials(storage, { username: 'root', password: 'secret', remember: true, autologin: true });
    expect(loadStoredCredentials(storage)).toMatchObject({ username: 'root', password: 'secret' });
    saveStoredSession(storage, { response_id: 'resp-9', usage: { inputTokens: 1, cachedTokens: 0, outputTokens: 2, turns: 1 }, last_assistant_message: 'hello' });
    expect(loadStoredSession(storage)).toMatchObject({ response_id: 'resp-9', last_assistant_message: 'hello' });

    app = createFrontendApp({
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

    await flush();
    expect(fetch).toHaveBeenCalledWith('/api/login', expect.objectContaining({ method: 'POST' }));
    expect(FakeWebSocket.instances).toHaveLength(1);

    const socket = FakeWebSocket.instances[0];
    socket.emit('open');
    const sync = JSON.parse(socket.sendCalls.at(-1));
    expect(sync).toMatchObject({ type: 'session.sync', state: expect.objectContaining({ response_id: 'resp-9' }) });

    socket.emit('message', { data: JSON.stringify({ type: 'connected', username: 'root' }) });
    socket.emit('message', { data: JSON.stringify({ type: 'session.state', state: { response_id: 'resp-10', usage: { inputTokens: 4, cachedTokens: 1, outputTokens: 2, turns: 2 }, last_user_message: 'hi', last_assistant_message: 'hello', cwd: '/tmp/work' } }) });
    socket.emit('message', { data: JSON.stringify({ type: 'chat.ack', text: 'hi' }) });
    socket.emit('message', { data: JSON.stringify({ type: 'openai.event', event: { type: 'response.output_text.delta', delta: 'hello' } }) });
    socket.emit('message', { data: JSON.stringify({ type: 'assistant.complete', response_id: 'resp-10', text: 'hello', state: { response_id: 'resp-10', usage: { inputTokens: 4, cachedTokens: 1, outputTokens: 2, turns: 2 }, last_user_message: 'hi', last_assistant_message: 'hello', cwd: '/tmp/work' } }) });

    expect(env['[data-login-screen]'].hidden).toBe(true);
    expect(env['[data-session-screen]'].hidden).toBe(false);
    expect(env['[data-status]'].textContent).toBe('connected');
    expect(env['[data-ws-status]'].textContent).toBe('connected');
    expect(env['[data-cwd]'].textContent).toBe('/tmp/work');
    expect(env['[data-response-id]'].textContent).toBe('resp-10');
    expect(env['[data-summary]'].textContent).toBe('hello');
    expect(env['[data-assistant-status]'].textContent).toBe('ready');
    expect(storage.getItem('agentx.gui.session')).toContain('resp-10');
  });

  test('sends chat messages and clears session state from the composer', async () => {
    FakeWebSocket.instances = [];
    const storage = new FakeStorage();
    const env = buildEnvironment();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, username: 'root', token: 'token-123', expiresAt: 123, ttlMs: 30000 }),
    });

    saveCredentials(storage, { username: 'root', password: 'secret', remember: true, autologin: true });
    app = createFrontendApp({
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

    await flush();
    const socket = FakeWebSocket.instances[0];
    socket.emit('open');
    env['[data-composer-input]'].value = 'hi';
    env['[data-composer-form]'].dispatch('submit', { preventDefault() {} });

    const sent = JSON.parse(socket.sendCalls.at(-1));
    expect(sent).toMatchObject({ type: 'chat.message', text: 'hi' });
    expect(env['[data-transcript]'].children.some((child) => child.children?.[0]?.textContent === 'You')).toBe(true);

    env['[data-clear-button]'].dispatch('click');
    expect(JSON.parse(socket.sendCalls.at(-1))).toMatchObject({ type: 'session.clear' });
    expect(storage.getItem('agentx.gui.session')).toBeNull();
  });
});
