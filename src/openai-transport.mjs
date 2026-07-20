import { createOpenAIWebSocketClient } from './openai-websocket.mjs';

function makeTransportError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function normalizeServerError(event) {
  const payload = event?.error ?? {};
  const code = payload?.code || payload?.type || event?.code || 'openai_websocket_error';
  const message = payload?.message || event?.message || 'OpenAI websocket error';
  return makeTransportError(message, {
    code,
    status: event?.status,
    param: payload?.param,
    event,
  });
}

function isReconnectableClose(code, reason) {
  if (code === 1000 || code === 1001) return true;
  const text = String(reason ?? '').toLowerCase();
  return text.includes('close') || text.includes('limit') || text.includes('disconnect');
}

export function createOpenAIResponsesTransport({
  apiKey,
  url,
  WebSocketImpl,
  debug = false,
  debugLogger = null,
  socketCloseTimeoutMs = 30_000, // default timeout for server close
} = {}) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  let client = null;
  let readyResolve = null;
  let readyReject = null;
  let readyPromise = null;
  let active = null;
  let closed = false;
  let intentionalClose = false;
  let closeTimer = null;

  const finishActive = (fn, value) => {
    if (!active) return false;
    const current = active;
    active = null;
    fn(current, value);
    return true;
  };

  const rejectActive = (error) => finishActive((current, err) => current.reject(err), error);
  const resolveActive = (response) => finishActive((current, payload) => current.resolve(payload), response);

  const clearConnection = () => {
    client = null;
    readyPromise = null;
    readyResolve = null;
    readyReject = null;
  };

  const connect = () => {
    if (client) return client;

    readyPromise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    client = createOpenAIWebSocketClient({
      apiKey,
      url,
      WebSocketImpl,
      debug,
      debugLogger,
      onOpen: () => {
        if (readyResolve) readyResolve(client);
        readyResolve = null;
        readyReject = null;
      },
      onMessage: handleEvent,
      onError: handleSocketError,
      onClose: handleClose,
    });

    return client;
  };

  const resendActiveRequest = async () => {
    connect();
    try {
      await readyPromise;
      client.sendResponseCreate(active.request);
      return true;
    } catch (error) {
      rejectActive(error);
      return false;
    }
  };

  const handleEvent = (message) => {
    const event = message?.json;
    if (!event) return;

    const current = active;
    if (!current) return;

    current.handlers?.onEvent?.(event, message);

    switch (event.type) {
      case 'response.created':
        current.responseId = event.response?.id || current.responseId || '';
        current.handlers?.onResponseCreated?.(event.response, event);
        break;
      case 'response.in_progress':
        current.handlers?.onResponseProgress?.(event.response, event);
        break;
      case 'response.output_item.added':
        current.handlers?.onItemAdded?.(event.item, event);
        break;
      case 'response.output_item.done':
        current.handlers?.onItemDone?.(event.item, event);
        break;
      case 'response.content_part.added':
        current.handlers?.onContentPartAdded?.(event.part, event);
        break;
      case 'response.content_part.done':
        current.handlers?.onContentPartDone?.(event.part, event);
        break;
      case 'response.output_text.delta':
        current.handlers?.onTextDelta?.(event.delta, event);
        break;
      case 'response.output_text.done':
        current.handlers?.onTextDone?.(event.text, event);
        break;
      case 'response.completed':
        current.handlers?.onResponseCompleted?.(event.response, event);
        resolveActive(event.response);
        break;
      case 'error': {
        const error = normalizeServerError(event);
        if (error.code === 'previous_response_not_found') {
          rejectActive(error);
          break;
        }
        if (error.code === 'websocket_connection_limit_reached') {
          clearConnection();
          void resendActiveRequest();
          break;
        }
        rejectActive(error);
        break;
      }
      default:
        break;
    }
  };

  const handleSocketError = (error) => {
    const transportError = makeTransportError(error?.message || 'OpenAI websocket error', { cause: error });
    if (readyReject) {
      readyReject(transportError);
      readyResolve = null;
      readyReject = null;
      readyPromise = null;
    }

    if (active && !intentionalClose) {
      clearConnection();
      void resendActiveRequest();
      return;
    }

    rejectActive(transportError);
  };

  const handleClose = (code, reason) => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (intentionalClose || closed) return;
    const transportError = makeTransportError('OpenAI websocket closed', {
      code,
      reason: Buffer.isBuffer(reason) ? reason.toString('utf8') : String(reason ?? ''),
    });

    if (readyReject) {
      readyReject(transportError);
      readyResolve = null;
      readyReject = null;
      readyPromise = null;
    }

    if (active && isReconnectableClose(code, reason)) {
      clearConnection();
      void resendActiveRequest();
      return;
    }

    rejectActive(transportError);
  };

  async function create(request, handlers = {}) {
    if (closed) {
      throw makeTransportError('OpenAI websocket transport is closed');
    }
    if (active) {
      throw makeTransportError('Another response is already in flight');
    }

    connect();
    await readyPromise;

    return await new Promise((resolve, reject) => {
      active = {
        resolve,
        reject,
        handlers,
        request,
        responseId: '',
      };

      try {
        client.sendResponseCreate(request);
      } catch (error) {
        active = null;
        reject(error);
      }
    });
  }

  return {
    responses: {
      create,
    },
    close() {
      // Initiate a graceful shutdown. If the server does not respond within
      // `socketCloseTimeoutMs`, we forcefully mark the transport as closed.
      closed = true;
      intentionalClose = true;
      // If the socket already closed, nothing to do.
      if (!client) return;
      const socket = client.socket;
      client.close();
      // Wait for server close, then force termination if needed.
      closeTimer = setTimeout(() => {
        closeTimer = null;
        socket.terminate?.();
        rejectActive(makeTransportError('OpenAI websocket close timed out'));
      }, socketCloseTimeoutMs);
    },
  };
}
