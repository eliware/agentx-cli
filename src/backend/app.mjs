import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { consumeAuthToken, issueAuthToken, parseBearerToken } from './auth-tokens.mjs';
import { authenticateLinuxCredentials } from './linux-auth.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(rootDir, 'public');

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readRequestBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
  }
}

export function getTokenFromRequest(req) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    return requestUrl.searchParams.get('token') || parseBearerToken(req.headers.authorization);
  } catch {
    return parseBearerToken(req.headers.authorization);
  }
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.static(publicDir));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/login', async (req, res) => {
    try {
      const body = await parseJsonBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      const auth = await authenticateLinuxCredentials({ username, password });
      if (!auth.ok) {
        sendJson(res, 401, {
          ok: false,
          error: auth.reason || 'Invalid Linux credentials',
        });
        return;
      }

      const token = issueAuthToken(username);
      sendJson(res, 200, {
        ok: true,
        username,
        token: token.token,
        expiresAt: token.expiresAt,
        ttlMs: token.ttlMs,
      });
    } catch (error) {
      const statusCode = error?.statusCode || 500;
      sendJson(res, statusCode, {
        ok: false,
        error: error?.message || 'Login failed',
      });
    }
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

export function createHttpServer(app = createApp()) {
  return createServer(app);
}

export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, done) => {
      const token = getTokenFromRequest(info.req);
      const auth = consumeAuthToken(token);
      if (!auth) {
        done(false, 401, 'Unauthorized');
        return;
      }
      info.req.agentxAuth = auth;
      done(true);
    },
  });

  wss.on('connection', (socket, req) => {
    socket.send(JSON.stringify({
      type: 'connected',
      username: req?.agentxAuth?.username || null,
    }));

    socket.on('message', (message) => {
      socket.send(JSON.stringify({
        type: 'echo',
        message: message.toString(),
      }));
    });
  });

  return wss;
}

export async function startServer({ port = Number(process.env.PORT || 3100), host = process.env.HOST || '0.0.0.0' } = {}) {
  const app = createApp();
  const server = createHttpServer(app);

  attachWebSocketServer(server);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  process.stdout.write(`agentx-gui listening on http://${host}:${port}\n`);

  return { app, server, port, host };
}
