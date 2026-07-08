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
const { attachWebSocketServer, createApp, createHttpServer } = await import('../src/backend/app.mjs');

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

  test('rejects bad linux credentials', async () => {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'wrong' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid credentials' });
  });

  test('rejects websocket connections without a valid token', async () => {
    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws?token=nope`);
    const outcome = await new Promise((resolve) => {
      socket.once('open', () => resolve('open'));
      socket.once('unexpected-response', () => resolve('unexpected-response'));
      socket.once('error', () => resolve('error'));
      socket.once('close', () => resolve('close'));
    });

    expect(outcome).not.toBe('open');
    socket.terminate();
  });
});

