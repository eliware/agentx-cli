import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import WebSocket from 'ws';

const authMock = (username, password) => ({
  ok: username === 'root' && password === 'secret',
  reason: 'invalid credentials',
});

const createBrowserChatSession = jest.fn(async ({ send }) => ({
  snapshot: (overrides = {}) => ({
    response_id: 'resp-1',
    usage: { inputTokens: 1, cachedTokens: 0, outputTokens: 1, turns: 1 },
    last_user_message: 'hi',
    last_assistant_message: 'hello',
    pending_cli_transcript: '',
    pending_tool_calls: [],
    cwd: '/tmp/work',
    ...overrides,
  }),
  updateSessionState: jest.fn(),
  runMessage: jest.fn(async (text) => {
    send({ type: 'openai.event', event: { type: 'response.output_text.delta', delta: 'hello' } });
    send({ type: 'assistant.complete', response_id: 'resp-1', text: 'hello', state: { response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 0, outputTokens: 1, turns: 1 }, last_user_message: text, last_assistant_message: 'hello', pending_cli_transcript: '', pending_tool_calls: [], cwd: '/tmp/work' } });
  }),
  clear: jest.fn(),
  close: jest.fn(),
}));

await jest.unstable_mockModule('../src/backend/linux-auth.mjs', () => ({
  authenticateLinuxCredentials: jest.fn(async ({ username, password }) => authMock(username, password)),
}));

await jest.unstable_mockModule('../src/backend/browser-session.mjs', () => ({
  createBrowserChatSession,
}));

const { clearAuthTokens, countAuthTokens } = await import('../src/backend/auth-tokens.mjs');
const { attachWebSocketServer, createApp, createHttpServer, getTokenFromRequest, startServer } = await import('../src/backend/app.mjs');

describe('backend gui app', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = createApp();
    server = createHttpServer(app);
    attachWebSocketServer(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    clearAuthTokens();
    createBrowserChatSession.mockClear();
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('serves health and the root page', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ ok: true });

    const page = await fetch(`${baseUrl}/`);
    expect(page.status).toBe(200);
    await expect(page.text()).resolves.toContain('Ultimate terminal-grade chat UI');
  });

  test('logs in with linux credentials and relays websocket chat events', async () => {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'root', password: 'secret' }),
    });

    expect(response.status).toBe(200);
    const login = await response.json();
    expect(login.ok).toBe(true);
    expect(login.username).toBe('root');
    expect(typeof login.token).toBe('string');

    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws?token=${encodeURIComponent(login.token)}`);
    const messages = [];
    await new Promise((resolve, reject) => {
      socket.on('message', (data) => {
        const text = String(data);
        messages.push(JSON.parse(text));
        if (messages.length >= 1) resolve();
      });
      socket.once('error', reject);
    });

    expect(messages[0]).toMatchObject({ type: 'connected', username: 'root' });

    const wsEvents = [];
    socket.on('message', (data) => wsEvents.push(JSON.parse(String(data))));
    socket.send(JSON.stringify({ type: 'session.sync', state: { response_id: 'resp-0', usage: { inputTokens: 1, cachedTokens: 0, outputTokens: 0, turns: 0 }, cwd: '/tmp/work' } }));
    socket.send(JSON.stringify({ type: 'chat.message', text: 'hi', state: { response_id: 'resp-0', usage: { inputTokens: 1, cachedTokens: 0, outputTokens: 0, turns: 0 }, cwd: '/tmp/work' } }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(wsEvents.some((event) => event.type === 'session.state')).toBe(true);
    expect(wsEvents.some((event) => event.type === 'openai.event' && event.event?.type === 'response.output_text.delta')).toBe(true);
    expect(wsEvents.some((event) => event.type === 'assistant.complete' && event.text === 'hello')).toBe(true);
    expect(createBrowserChatSession).toHaveBeenCalled();
    expect(countAuthTokens()).toBe(0);

    await new Promise((resolve) => {
      socket.once('close', resolve);
      socket.close(1000, 'done');
    });
  });

  test('rejects malformed json, oversized bodies, and bad linux credentials', async () => {
    const invalid = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ ok: false, error: 'Invalid JSON body' });

    await expect(fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(1_000_001),
    })).rejects.toThrow(/fetch failed|SocketError|closed/i);

    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'wrong' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid credentials' });
  });

  test('falls back to authorization headers when websocket urls are malformed', () => {
    expect(getTokenFromRequest({
      url: 'http://[invalid',
      headers: { authorization: 'Bearer abc123' },
    })).toBe('abc123');
  });

  test('starts and stops a server on demand', async () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (...args) => {
      writes.push(args.join(''));
      return true;
    };

    try {
      const started = await startServer({ port: 0, host: '127.0.0.1' });
      expect(started.port).toBe(0);
      expect(started.host).toBe('127.0.0.1');
      expect(writes.join('')).toContain('agentx-gui listening on http://127.0.0.1:0');
      await new Promise((resolve) => started.server.close(resolve));
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
