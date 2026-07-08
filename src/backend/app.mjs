import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(rootDir, 'public');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.static(publicDir));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
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
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.send('connected');

    socket.on('message', (message) => {
      socket.send(`echo: ${message.toString()}`);
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
