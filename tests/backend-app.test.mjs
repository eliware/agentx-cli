import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import WebSocket from 'ws';

const authMock = (username, password) => ({
  ok: username === 'root' && password === 'secret',
  reason: 'invalid credentials',
});

await jest.unstable_mockModule('../src/backend/linux-auth.mjs', () => ({
  authenticateLinuxCredentials: jest.fn(async ({ username, password }) => authMock(username, password)),
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
    await expect(page.text()).resolves.toContain('<!doctype html>');
  });

  test('logs in with linux credentials and opens a one-time websocket token', async () => {
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
    const message = await new Promise((resolve, reject) => {
      socket.once('message', (data) => resolve(String(data)));
      socket.once('error', reject);
    });

    expect(JSON.parse(message)).toMatchObject({ type: 'connected', username: 'root' });
    expect(countAuthTokens()).toBe(0);

    await new Promise((resolve) => {
      socket.once('close', resolve);
      socket.close(1000, 'done');
    });

    const reuse = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws?token=${encodeURIComponent(login.token)}`);
    const outcome = await new Promise((resolve) => {
      reuse.once('open', () => resolve('open'));
      reuse.once('unexpected-response', () => resolve('unexpected-response'));
      reuse.once('error', () => resolve('error'));
      reuse.once('close', () => resolve('close'));
    });

    expect(outcome).not.toBe('open');
    reuse.terminate();
  });

  test('accepts bearer tokens in websocket headers and echoes messages', async () => {
    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'root', password: 'secret' }),
    });
    const login = await loginResponse.json();

    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws`, {
      headers: {
        authorization: `Bearer ${login.token}`,
      },
    });

    await new Promise((resolve, reject) => {
      socket.once('message', (data) => {
        expect(JSON.parse(String(data))).toMatchObject({ type: 'connected', username: 'root' });
        resolve();
      });
      socket.once('error', reject);
    });

    const echo = new Promise((resolve, reject) => {
      socket.once('message', (data) => resolve(JSON.parse(String(data))));
      socket.once('error', reject);
    });
    socket.send('hello');
    await expect(echo).resolves.toMatchObject({ type: 'echo', message: 'hello' });

    await new Promise((resolve) => {
      socket.once('close', resolve);
      socket.close();
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
