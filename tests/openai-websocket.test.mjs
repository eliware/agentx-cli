import { describe, expect, test, jest } from '@jest/globals';
import { createOpenAIWebSocketClient, formatOpenAIWebSocketFrame, parseOpenAIWebSocketMessage, sendOpenAIWebSocketEvent } from '../src/openai-websocket.mjs';

describe('openai websocket helpers', () => {
  test('parses text and binary websocket messages', () => {
    expect(parseOpenAIWebSocketMessage('{"type":"response.completed"}')).toEqual({
      raw: '{"type":"response.completed"}',
      json: { type: 'response.completed' },
    });

    expect(parseOpenAIWebSocketMessage(Buffer.from('{"type":"response.created"}'), true)).toEqual({
      raw: '{"type":"response.created"}',
      json: { type: 'response.created' },
    });

    expect(parseOpenAIWebSocketMessage('not json')).toEqual({ raw: 'not json', json: null });
  });

  test('creates a websocket client with bearer auth and response.create sending', () => {
    const handlers = new Map();
    const sent = [];

    class FakeWebSocket {
      constructor(url, options) {
        this.url = url;
        this.options = options;
      }
      on(event, handler) {
        handlers.set(event, handler);
      }
      send(payload) {
        sent.push(payload);
      }
      close(code, reason) {
        this.closed = { code, reason };
      }
    }

    const client = createOpenAIWebSocketClient({
      apiKey: 'test-key',
      url: 'wss://example.test',
      WebSocketImpl: FakeWebSocket,
      onOpen: jest.fn(),
      onMessage: jest.fn(),
      onError: jest.fn(),
      onClose: jest.fn(),
      onUpgrade: jest.fn(),
      onPing: jest.fn(),
      onPong: jest.fn(),
      onUnexpectedResponse: jest.fn(),
    });

    expect(client.socket.url).toBe('wss://example.test');
    expect(client.socket.options.headers.Authorization).toBe('Bearer test-key');

    client.sendResponseCreate({ model: 'gpt-5.4-mini', input: [] });
    expect(JSON.parse(sent[0])).toEqual({ type: 'response.create', model: 'gpt-5.4-mini', input: [] });

    sendOpenAIWebSocketEvent(client.socket, { type: 'response.create', model: 'gpt-5.4-mini' });
    expect(JSON.parse(sent[1])).toEqual({ type: 'response.create', model: 'gpt-5.4-mini' });

    handlers.get('open')();
    handlers.get('message')('{"type":"response.completed"}', false);
    handlers.get('close')(1000, Buffer.from('bye'));
    handlers.get('error')(new Error('boom'));
    handlers.get('ping')(Buffer.from('pong'));
    handlers.get('pong')(Buffer.from('ping'));
    handlers.get('upgrade')({ statusCode: 101 });
    handlers.get('unexpected-response')({}, { statusCode: 400 });

    client.close(1000, Buffer.from('bye'));
    expect(client.socket.closed).toEqual({ code: 1000, reason: Buffer.from('bye') });
  });

  test('logs websocket frames when debug is enabled', () => {
    const handlers = new Map();
    const sent = [];
    const logs = [];
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      class FakeWebSocket {
        constructor(url, options) {
          this.url = url;
          this.options = options;
        }
        on(event, handler) {
          handlers.set(event, handler);
        }
        send(payload) {
          sent.push(payload);
        }
        close(code, reason) {
          this.closed = { code, reason };
        }
      }

      const client = createOpenAIWebSocketClient({
        apiKey: 'test-key',
        url: 'wss://example.test',
        WebSocketImpl: FakeWebSocket,
        debug: true,
        onMessage: jest.fn(),
        onError: jest.fn(),
        onClose: jest.fn(),
      });

      client.sendResponseCreate({ model: 'gpt-5.4-mini', input: [] });
      handlers.get('message')('{"type":"response.completed"}', false);
      handlers.get('error')(new Error('boom'));
      handlers.get('close')(1000, Buffer.from('bye'));

      expect(sent).toHaveLength(1);
      expect(logs).toContain('ws send: {"type":"response.create","model":"gpt-5.4-mini","input":[]}');
      expect(logs).toContain('ws recv: {"type":"response.completed"}');
      expect(logs.some((line) => line.startsWith('ws error: '))).toBe(true);
      expect(logs).toContain('ws close code=1000: bye');
    } finally {
      console.log = originalConsoleLog;
    }
  });

  test('formats websocket frames as decoded text', () => {
    const frame = formatOpenAIWebSocketFrame(Buffer.from('bye'), true, 'ws recv');
    expect(frame).toBe('ws recv: bye');
  });

  test('parses additional websocket payload shapes', () => {
    expect(parseOpenAIWebSocketMessage(new Uint8Array(Buffer.from('{"type":"response.updated"}')))).toEqual({
      raw: '{"type":"response.updated"}',
      json: { type: 'response.updated' },
    });

    expect(parseOpenAIWebSocketMessage({ toString: () => '{"type":"response.delta"}' }, true)).toEqual({
      raw: '{"type":"response.delta"}',
      json: { type: 'response.delta' },
    });

    expect(parseOpenAIWebSocketMessage({ value: 1 })).toEqual({ raw: '[object Object]', json: null });
    expect(parseOpenAIWebSocketMessage(undefined)).toEqual({ raw: '', json: null });
  });

  test('creates a websocket client without optional handlers', () => {
    const events = [];

    class FakeWebSocket {
      constructor(url, options) {
        this.url = url;
        this.options = options;
      }
      on(event, handler) {
        events.push([event, handler]);
      }
      send(payload) {
        this.sent = payload;
      }
      close(code, reason) {
        this.closed = { code, reason };
      }
    }

    const client = createOpenAIWebSocketClient({ apiKey: 'test-key', WebSocketImpl: FakeWebSocket });
    expect(client.socket.options.headers.Authorization).toBe('Bearer test-key');
    expect(events).toEqual([]);
    client.send({ type: 'ping' });
    expect(client.socket.sent).toBe('{"type":"ping"}');
  });

  test('rejects missing api keys', () => {
    expect(() => createOpenAIWebSocketClient(undefined)).toThrow('OpenAI API key is required');
  });
});
