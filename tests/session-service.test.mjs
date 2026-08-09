import { describe, expect, jest, test } from '@jest/globals';
import { buildInputMessage } from '../src/prompt-builder.mjs';
import { sendMessage } from '../src/agent-session/session-service.mjs';

describe('agent session modules', () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => { stdoutWrites.push(String(chunk)); return true; };
  });

  afterEach(() => { process.stdout.write = originalStdoutWrite; });

  test('sendMessage stops status controller when streaming fails', async () => {
    const statusController = { showReasoning: jest.fn(), clear: jest.fn(), stop: jest.fn() };
    const openai = { responses: { create: jest.fn().mockRejectedValue(new Error('stream failed')) } };
    await expect(sendMessage(openai, { model: 'test-model', input: [], tools: [] }, '', 'hello', '', '/tmp/work', null, null, { statusController })).rejects.toThrow('stream failed');
    expect(statusController.stop).toHaveBeenCalledTimes(1);
  });
  test('sendMessage uses first-message templating on a fresh session', async () => {
    const template = {
      model: 'test-model',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
      ],
      context_management: [{ type: 'compaction', compact_threshold: 300000 }],
      tools: [],
    };

    const calls = [];
    const openai = {
      responses: {
        create: async (request) => {
          calls.push(request);
          return { id: 'resp-1', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work');

    expect(calls[0].input[1].content[0].text).toBe('hello');
    expect(calls[0].input[0].content[0].text).toContain('/tmp/work');
    expect(calls[0].context_management).toEqual([{ type: 'compaction', compact_threshold: 300000 }]);
  });
  test('sendMessage resumes with previous_response_id for subsequent turns', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const calls = [];
    const openai = {
      responses: {
        create: async (request) => {
          calls.push(request);
          return { id: 'resp-2', output: [] };
        },
      },
    };

    await sendMessage(openai, template, 'prev-1', 'next', '', '/tmp/work');

    expect(calls[0]).toEqual({
      model: 'test-model',
      input: [buildInputMessage('next')],
      store: true,
      tools: [],
      previous_response_id: 'prev-1',
    });
  });
  test('sendMessage preserves top-level prompt config when using a request override', async () => {
    const template = {
      model: 'test-model',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
      ],
      text: { format: { type: 'text' }, verbosity: 'low' },
      reasoning: { effort: 'medium', summary: null },
      context_management: [{ type: 'compaction', compact_threshold: 300000 }],
      tools: [],
    };
    const calls = [];
    const openai = {
      responses: {
        create: async (request) => {
          calls.push(request);
          return { id: 'resp-1', output: [] };
        },
      },
    };

    await sendMessage(openai, template, 'prev-1', 'next', '', '/tmp/work', null, {
      model: 'test-model',
      input: [buildInputMessage('next')],
      store: true,
      tools: [],
      previous_response_id: 'prev-1',
    });

    expect(calls[0]).toMatchObject({
      model: 'test-model',
      text: { format: { type: 'text' }, verbosity: 'low' },
      reasoning: { effort: 'medium', summary: null },
      context_management: [{ type: 'compaction', compact_threshold: 300000 }],
      input: [buildInputMessage('next')],
      store: true,
      tools: [],
      previous_response_id: 'prev-1',
    });
  });
  test('sendMessage pauses live status during web search events and resumes reasoning after completion', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const template = { model: 'test-model', input: [], tools: [] };
      let handlers;
      let resolveResponse;
      const openai = {
        responses: {
          create: async (_request, nextHandlers) => {
            handlers = nextHandlers;
            return await new Promise((resolve) => {
              resolveResponse = resolve;
            });
          },
        },
      };

      const pending = sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work', null, null, { liveStreaming: true });

      expect(stdoutWrites.join('')).toContain('{"time":"0s"');

      handlers.onEvent({ type: 'response.web_search_call.in_progress' }, { raw: '{"type":"response.web_search_call.in_progress"}' });
      handlers.onEvent({ type: 'response.web_search_call.searching' }, { raw: '{"type":"response.web_search_call.searching"}' });

      const writeCount = stdoutWrites.length;
      await jest.advanceTimersByTimeAsync(1000);
      expect(stdoutWrites.length).toBe(writeCount);

      handlers.onItemDone({
        type: 'web_search_call',
        action: {
          queries: ['alpha'],
          sources: [{ type: 'url', url: 'https://example.com' }],
        },
      });

      const output = stdoutWrites.join('');
      expect(output).toContain('[38;5;213m{"web_search":"in_progress"}[0m');
      expect(output).toContain('[38;5;213m{"web_search":"searching"}[0m');
      expect(output).toContain('\u001b[38;5;213m{\n  "web_search": "complete",');
      expect(output).toContain(`"queries": [
    "alpha"
  ]`);
      expect(output).toContain(`"sources": [
    "https://example.com"
  ]`);
      expect(output).toContain('[32m"reasoning":"0s/0s"[38;5;255m');

      const beforeBlank = stdoutWrites.length;
      handlers.onItemDone({ type: 'web_search_call', action: { queries: [], sources: [] } });
      expect(stdoutWrites.length).toBe(beforeBlank);

      resolveResponse({ id: 'resp-live', output: [] });
      await pending;
    } finally {
      jest.useRealTimers();
    }
  });
  test('sendMessage appends a newline after live streamed text when needed', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers?.onTextDelta('done');
          return { id: 'resp-live', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work', null, null, { liveStreaming: true });

    expect(stdoutWrites.join('')).toContain(`done\x1b[0m\n`);
  });
  test('sendMessage does not append an extra newline when streamed text already ends with one', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers?.onTextDelta('done\n');
          return { id: 'resp-live', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work', null, null, { liveStreaming: true });

    expect(stdoutWrites.join('')).toContain(`done\n\x1b[0m`);
    expect(stdoutWrites.join('')).not.toContain('done\n\n');
  });
  test('sendMessage shows live stats until the first streamed delta and formats long waits as minutes', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const template = { model: 'test-model', input: [], tools: [] };
      let handlers;
      let resolveResponse;
      const openai = {
        responses: {
          create: async (_request, nextHandlers) => {
            handlers = nextHandlers;
            return await new Promise((resolve) => {
              resolveResponse = resolve;
            });
          },
        },
      };

      const pending = sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work', null, null, { liveStreaming: true });

      expect(stdoutWrites.join('')).toContain('{"time":"0s",\u001b[32m"reasoning":"0s/0s"\u001b[38;5;255m,"writing":"0s/0s"');

      await jest.advanceTimersByTimeAsync(1000);
      expect(stdoutWrites.join('')).toContain('{"time":"1s"');

      handlers.onTextDelta('Hi');
      resolveResponse({ id: 'resp-live', output: [] });
      await pending;

      const output = stdoutWrites.join('');
      expect(output).toContain('Hi');
      expect(output).toContain('\u001b[38;5;255m{"time":');
    } finally {
      jest.useRealTimers();
    }
  });
});
