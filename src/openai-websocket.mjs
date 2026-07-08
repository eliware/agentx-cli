import WebSocket from 'ws';

export const OPENAI_RESPONSES_WS_URL = 'wss://api.openai.com/v1/responses';

function toUtf8String(data, isBinary) {
  const binary = Boolean(isBinary);
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof Uint8Array) return Buffer.from(data).toString('utf8');
  if (binary && data?.toString) return data.toString('utf8');
  return String(data ?? '');
}

export function parseOpenAIWebSocketMessage(data, isBinary = false) {
  const raw = toUtf8String(data, isBinary);
  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}

export function sendOpenAIWebSocketEvent(socket, payload) {
  socket.send(JSON.stringify(payload));
}

export function createOpenAIWebSocketClient(options) {
  const {
  apiKey,
  url = OPENAI_RESPONSES_WS_URL,
  WebSocketImpl = WebSocket,
  onOpen,
  onMessage,
  onError,
  onClose,
  onUpgrade,
  onPing,
  onPong,
  onUnexpectedResponse,
} = options ?? {};
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const socket = new WebSocketImpl(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (onOpen) socket.on('open', () => onOpen(socket));
  if (onMessage) socket.on('message', (data, isBinary) => onMessage(parseOpenAIWebSocketMessage(data, isBinary), socket));
  if (onError) socket.on('error', (error) => onError(error, socket));
  if (onClose) socket.on('close', (code, reason) => onClose(code, reason, socket));
  if (onUpgrade) socket.on('upgrade', (response) => onUpgrade(response, socket));
  if (onPing) socket.on('ping', (data) => onPing(data, socket));
  if (onPong) socket.on('pong', (data) => onPong(data, socket));
  if (onUnexpectedResponse) socket.on('unexpected-response', (req, res) => onUnexpectedResponse(req, res, socket));

  return {
    socket,
    send(payload) {
      sendOpenAIWebSocketEvent(socket, payload);
    },
    sendResponseCreate(request) {
      sendOpenAIWebSocketEvent(socket, { type: 'response.create', ...request });
    },
    close(code, reason) {
      socket.close(code, reason);
    },
  };
}
