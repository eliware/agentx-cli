import { describe, expect, test, jest } from '@jest/globals';
import { createOpenAIResponsesTransport } from '../src/openai-transport.mjs';

describe('openai transport', () => {
  test('reconnects and resends an active request after websocket connection limit errors', async () => {
    const instances = [];
    const sent = [];
    const handlersByInstance = [];

    class FakeWebSocket {
      constructor(url, options) {
        this.url = url;
        this.options = options;
        this.handlers = {};
        handlersByInstance.push(this.handlers);
        instances.push(this);
      }
      on(event, handler) {
        this.handlers[event] = handler;
      }
      send(payload) {
        sent.push(payload);
      }
      close() {}
    }

    const transport = createOpenAIResponsesTransport({ apiKey: 'test-key', url: 'wss://example.test', WebSocketImpl: FakeWebSocket });

    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [{ type: 'message' }] });

    expect(instances).toHaveLength(1);
    handlersByInstance[0].open();
    await Promise.resolve();
    expect(sent).toHaveLength(1);

    handlersByInstance[0].message(JSON.stringify({
      type: 'error',
      status: 400,
      error: {
        code: 'websocket_connection_limit_reached',
        message: 'Responses websocket connection limit reached (60 minutes).',
      },
    }), false);

    await Promise.resolve();
    expect(instances).toHaveLength(2);
    handlersByInstance[1].open();
    await Promise.resolve();
    expect(sent).toHaveLength(2);

    handlersByInstance[1].message(JSON.stringify({ type: 'response.completed', response: { id: 'resp-final', output: [] } }), false);

    await expect(responsePromise).resolves.toEqual({ id: 'resp-final', output: [] });
  });

  test('rejects previous_response_not_found without retrying', async () => {
    const instances = [];
    const handlersByInstance = [];

    class FakeWebSocket {
      constructor() {
        this.handlers = {};
        handlersByInstance.push(this.handlers);
        instances.push(this);
      }
      on(event, handler) {
        this.handlers[event] = handler;
      }
      send() {}
      close() {}
    }

    const transport = createOpenAIResponsesTransport({ apiKey: 'test-key', WebSocketImpl: FakeWebSocket });
    const responsePromise = transport.responses.create({ model: 'gpt-test', input: [] });

    handlersByInstance[0].open();
    await Promise.resolve();
    handlersByInstance[0].message(JSON.stringify({
      type: 'error',
      status: 400,
      error: {
        code: 'previous_response_not_found',
        message: "Previous response with id 'resp_abc' not found.",
        param: 'previous_response_id',
      },
    }), false);

    await expect(responsePromise).rejects.toMatchObject({ code: 'previous_response_not_found', status: 400 });
    expect(instances).toHaveLength(1);
  });
});
