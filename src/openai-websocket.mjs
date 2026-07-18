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

export function formatOpenAIWebSocketFrame(data, isBinary = false, label = 'frame') {
  return `${label}: ${toUtf8String(data, isBinary)}`;
}

function createWebSocketDebugLogger(debug) {
  if (!debug) return null;
  if (typeof debug === 'function') return debug;
  return (line) => console.log(line);
}

function shouldLogWebSocketFrame(raw) {
  /* istanbul ignore next */
  const text = String(raw ?? '');
  return !text.includes('response.output_text.delta')
    && !text.includes('response.function_call_arguments.delta')
    && !text.includes('response.shell_call_command.delta')
    && !text.includes('response.reasoning_summary_text.delta')
    && !text.includes('response.mcp_call_arguments.delta');
}

export function sendOpenAIWebSocketEvent(socket, payload, debug = null) {
  const raw = JSON.stringify(payload);
  if (debug) debug(formatOpenAIWebSocketFrame(raw, false, 'ws send'));
  socket.send(raw);
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
    debug = false,
    debugLogger = null,
  } = options ?? {};
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const logDebug = createWebSocketDebugLogger(debugLogger ?? debug);
  const socket = new WebSocketImpl(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (onOpen) socket.on('open', () => onOpen(socket));
  if (onMessage) socket.on('message', (data, isBinary) => {
    const message = parseOpenAIWebSocketMessage(data, isBinary);
    if (logDebug && shouldLogWebSocketFrame(message.raw)) logDebug(formatOpenAIWebSocketFrame(message.raw, false, 'ws recv'));
    onMessage(message, socket);
  });
  if (onError) socket.on('error', (error) => {
    if (logDebug) logDebug(`ws error: ${error?.stack || error?.message || String(error)}`);
    onError(error, socket);
  });
  if (onClose) socket.on('close', (code, reason) => {
    if (logDebug) logDebug(formatOpenAIWebSocketFrame(reason, Buffer.isBuffer(reason) || reason instanceof Uint8Array, `ws close code=${code}`));
    onClose(code, reason, socket);
  });
  if (onUpgrade) socket.on('upgrade', (response) => onUpgrade(response, socket));
  if (onPing) socket.on('ping', (data) => onPing(data, socket));
  if (onPong) socket.on('pong', (data) => onPong(data, socket));
  if (onUnexpectedResponse) socket.on('unexpected-response', (req, res) => onUnexpectedResponse(req, res, socket));

  return {
    socket,
    send(payload) {
      sendOpenAIWebSocketEvent(socket, payload, logDebug);
    },
    sendResponseCreate(request) {
      sendOpenAIWebSocketEvent(socket, { type: 'response.create', ...request }, logDebug);
    },
    close(code, reason) {
      socket.close(code, reason);
    },
  };
}
