import { describe, expect, test, jest } from '@jest/globals';
import { createOpenAIResponsesTransport } from '../src/openai-transport.mjs';

function makeFakeWebSocketClass({ instances, sent, sendHook } = {}) {
  return class FakeWebSocket {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.handlers = {};
      instances?.push(this);
    }
    on(event, handler) {
      this.handlers[event] = handler;
    }
    send(payload) {
      sent?.push(payload);
      sendHook?.(payload, this);
    }
    close(code, reason) {
      this.closed = { code, reason };
    }
    emit(event, ...args) {
      this.handlers[event]?.(...args);
    }
  };
}

function makeTransport({ instances = [], sent = [], sendHook } = {}) {
  const WebSocketImpl = makeFakeWebSocketClass({ instances, sent, sendHook });
  const transport = createOpenAIResponsesTransport({ apiKey: 'test-key', url: 'wss://example.test', WebSocketImpl });
  return { transport, instances, sent };
}

describe('openai transport', () => {
  test('routes websocket events, resolves completed responses, and closes intentionally', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });
    const callbacks = {
      onEvent: jest.fn(),
      onResponseCreated: jest.fn(),
      onResponseProgress: jest.fn(),
      onItemAdded: jest.fn(),
      onItemDone: jest.fn(),
      onContentPartAdded: jest.fn(),
      onContentPartDone: jest.fn(),
      onTextDelta: jest.fn(),
      onTextDone: jest.fn(),
      onResponseCompleted: jest.fn(),
    };

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] }, callbacks);
    expect(instances).toHaveLength(1);

    instances[0].emit('open');
    await Promise.resolve();
    expect(sent).toHaveLength(1);

    instances[0].emit('message', 'not json', false);
    instances[0].emit('message', JSON.stringify({ type: 'response.created', response: {} }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.created', response: { id: 'resp-1' } }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.in_progress', response: { id: 'resp-1' } }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.output_item.added', item: { type: 'message' } }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.output_item.done', item: { type: 'message' } }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.content_part.added', part: { type: 'text' } }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.content_part.done', part: { type: 'text' } }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.output_text.delta', delta: 'hello' }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.output_text.done', text: 'hello' }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.output_item.added', item: { type: 'message' } }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.unknown', extra: true }), false);
    instances[0].emit('message', JSON.stringify({ type: 'response.completed', response: { id: 'resp-final', output: [] } }), false);

    await expect(responsePromise).resolves.toEqual({ id: 'resp-final', output: [] });
    expect(callbacks.onEvent).toHaveBeenCalled();
    expect(callbacks.onResponseCreated).toHaveBeenCalledWith({ id: 'resp-1' }, expect.objectContaining({ type: 'response.created' }));
    expect(callbacks.onResponseProgress).toHaveBeenCalled();
    expect(callbacks.onItemAdded).toHaveBeenCalled();
    expect(callbacks.onItemDone).toHaveBeenCalled();
    expect(callbacks.onContentPartAdded).toHaveBeenCalled();
    expect(callbacks.onContentPartDone).toHaveBeenCalled();
    expect(callbacks.onTextDelta).toHaveBeenCalledWith('hello', expect.objectContaining({ type: 'response.output_text.delta' }));
    expect(callbacks.onTextDone).toHaveBeenCalledWith('hello', expect.objectContaining({ type: 'response.output_text.done' }));
    expect(callbacks.onResponseCompleted).toHaveBeenCalledWith({ id: 'resp-final', output: [] }, expect.objectContaining({ type: 'response.completed' }));

    instances[0].emit('message', JSON.stringify({ type: 'response.output_text.delta', delta: 'late' }), false);
    transport.close();
    expect(instances[0].closed).toEqual({ code: undefined, reason: undefined });
    instances[0].emit('close', 1000, Buffer.from('bye'));
  });

  test('reconnects after a reconnectable websocket close code', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();
    expect(sent).toHaveLength(1);

    instances[0].emit('close', 1000, Buffer.from('disconnect'));
    await Promise.resolve();
    expect(instances).toHaveLength(2);

    instances[1].emit('open');
    await Promise.resolve();
    expect(sent).toHaveLength(2);
    instances[1].emit('message', JSON.stringify({ type: 'response.completed', response: { id: 'resp-retry', output: [] } }), false);

    await expect(responsePromise).resolves.toEqual({ id: 'resp-retry', output: [] });
  });

  test('reconnects after websocket connection limit errors and surfaces resend failures', async () => {
    const instances = [];
    const sent = [];
    let sendCount = 0;
    const { transport } = makeTransport({ instances, sent, sendHook: () => {
      sendCount += 1;
      if (sendCount === 2) throw new Error('resend exploded');
    } });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();

    instances[0].emit('message', JSON.stringify({
      type: 'error',
      status: 400,
      error: {
        code: 'websocket_connection_limit_reached',
        message: 'Responses websocket connection limit reached (60 minutes).',
      },
    }), false);

    expect(instances).toHaveLength(2);
    instances[1].emit('open');
    await expect(responsePromise).rejects.toThrow('resend exploded');
  });

  test('reconnects after websocket close reasons that indicate disconnects', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();

    instances[0].emit('close', 4000, Buffer.from('disconnect'));
    await Promise.resolve();
    expect(instances).toHaveLength(2);

    instances[1].emit('open');
    await Promise.resolve();
    instances[1].emit('message', JSON.stringify({ type: 'response.completed', response: { id: 'resp-retry', output: [] } }), false);

    await expect(responsePromise).resolves.toEqual({ id: 'resp-retry', output: [] });
  });

  test('rejects nonreconnectable websocket closes', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();

    instances[0].emit('close', 4000, 'nope');
    await expect(responsePromise).rejects.toMatchObject({ message: 'OpenAI websocket closed', code: 4000, reason: 'nope' });
  });

  test('rejects websocket closes with no reason string', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();

    instances[0].emit('close', 4001, undefined);
    await expect(responsePromise).rejects.toMatchObject({ message: 'OpenAI websocket closed', code: 4001, reason: '' });
  });

  test('reconnects after websocket errors while a response is active', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();

    instances[0].emit('error', new Error('socket blew up'));
    await Promise.resolve();
    expect(instances).toHaveLength(2);

    instances[1].emit('open');
    await Promise.resolve();
    instances[1].emit('message', JSON.stringify({ type: 'response.completed', response: { id: 'resp-recovered', output: [] } }), false);

    await expect(responsePromise).resolves.toEqual({ id: 'resp-recovered', output: [] });
  });

  test('rejects transport errors before the websocket opens', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    expect(instances).toHaveLength(1);
    instances[0].emit('error', {});

    await expect(responsePromise).rejects.toMatchObject({ message: 'OpenAI websocket error', cause: {} });
  });

  test('rejects websocket closes before the connection opens', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    expect(instances).toHaveLength(1);
    instances[0].emit('close', 4000, Buffer.from('startup failure'));

    await expect(responsePromise).rejects.toMatchObject({ message: 'OpenAI websocket closed', code: 4000, reason: 'startup failure' });
  });

  test('normalizes websocket error payloads and rejects previous response errors without retrying', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();

    instances[0].emit('message', JSON.stringify({
      type: 'error',
      status: 500,
      error: { code: 'server_code', type: 'ignored_type', message: 'server said no', param: 'p' },
    }), false);

    await expect(responsePromise).rejects.toMatchObject({ code: 'server_code', status: 500, param: 'p', message: 'server said no' });

    const previousMissing = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();
    instances[0].emit('message', JSON.stringify({
      type: 'error',
      status: 400,
      error: { code: 'previous_response_not_found', message: 'missing', param: 'previous_response_id' },
    }), false);

    await expect(previousMissing).rejects.toMatchObject({ code: 'previous_response_not_found', status: 400 });

    const fallback = transport.responses.create({ model: 'gpt-test', input: [] });
    instances[0].emit('open');
    await Promise.resolve();
    instances[0].emit('message', JSON.stringify({ type: 'error', status: 429 }), false);
    await expect(fallback).rejects.toMatchObject({ code: 'openai_websocket_error', message: 'OpenAI websocket error', status: 429 });
  });

  test('rejects closed transports and concurrent create calls', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent });

    transport.close();
    await expect(transport.responses.create({ model: 'gpt-test', input: [] })).rejects.toThrow('OpenAI websocket transport is closed');

    const instances2 = [];
    const sent2 = [];
    const { transport: transport2 } = makeTransport({ instances: instances2, sent: sent2 });
    const first = transport2.responses.create({ model: 'gpt-test', input: [] });
    instances2[0].emit('open');
    await Promise.resolve();
    await expect(transport2.responses.create({ model: 'gpt-test', input: [] })).rejects.toThrow('Another response is already in flight');
    instances2[0].emit('message', JSON.stringify({ type: 'response.completed', response: { id: 'resp-first', output: [] } }), false);
    await expect(first).resolves.toEqual({ id: 'resp-first', output: [] });
  });

  test('uses the existing websocket client for later requests and surfaces sendResponseCreate failures', async () => {
    const instances = [];
    const sent = [];
    const { transport } = makeTransport({ instances, sent, sendHook: (payload) => {
      if (payload.includes('boom')) throw new Error('send exploded');
    } });

    const first = transport.responses.create({ model: 'gpt-test', input: [{ type: 'message', id: 'one' }] });
    instances[0].emit('open');
    await Promise.resolve();
    instances[0].emit('message', JSON.stringify({ type: 'response.completed', response: { id: 'resp-1', output: [] } }), false);
    await expect(first).resolves.toEqual({ id: 'resp-1', output: [] });

    const second = transport.responses.create({ model: 'gpt-test', input: [{ type: 'message', id: 'two' }] });
    instances[0].emit('open');
    await Promise.resolve();
    instances[0].emit('message', JSON.stringify({ type: 'response.completed', response: { id: 'resp-2', output: [] } }), false);
    await expect(second).resolves.toEqual({ id: 'resp-2', output: [] });
    expect(instances).toHaveLength(1);

    const boom = transport.responses.create({ model: 'gpt-test', input: [{ type: 'message', id: 'boom' }] });
    instances[0].emit('open');
    await Promise.resolve();
    await expect(boom).rejects.toThrow('send exploded');
  });

  test('rejects missing api keys', () => {
    expect(() => createOpenAIResponsesTransport()).toThrow('OpenAI API key is required');
  });
});
