import { describe, expect, jest, test } from '@jest/globals';
import { buildInputMessage } from '../src/prompt-builder.mjs';
import { formatUsageSummary, handleToolCalls, responseItemToTranscript, sendMessage, extractUsage, readSessionState, formatElapsedStatus, formatSpinnerFrame, formatTransactionCompletionMessage, createStatusLineController, createStreamedResponse } from '../src/agent-session.mjs';
import { cleanupTempDir, makeFile, makeTempDir } from './test-helpers.mjs';

describe('agent session helpers', () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });


  test('responseItemToTranscript covers the remaining item shapes', () => {
    expect(responseItemToTranscript({ role: 'assistant', type: 'message', content: [{ type: 'input_text' }, { type: 'output_text' }, { type: 'refusal', refusal: '' }, { text: 'gamma' }] })).toBe('assistant: gamma');
    expect(responseItemToTranscript({ type: 'message', content: [{ type: 'input_text', text: '' }, { type: 'output_text', text: '' }] })).toBe('');
    expect(responseItemToTranscript({ type: 'function_call', name: 'shell_call', input: '{not valid json' })).toBe('assistant shell call: {not valid json');
    expect(responseItemToTranscript({ type: 'function_call', name: 'other_tool', input: 'abc' })).toBe('assistant tool call: other_tool(abc)');
    expect(responseItemToTranscript({ type: 'function_call', name: 'other_tool' })).toBe('assistant tool call: other_tool()');
    expect(responseItemToTranscript({ type: 'message', content: undefined })).toBe('');
    expect(responseItemToTranscript({ type: 'function_call_output', output: null })).toBe('tool output: ');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', output: [{ stdout: 'x'.repeat(200), stderr: 'y'.repeat(200), outcome: { type: 'exit', exit_code: 0 } }, 'ignored'], max_output_length: 10, status: 'completed' })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'reasoning', summary: [] })).toBe('');
    expect(responseItemToTranscript({ type: 'reasoning', summary: [{ type: 'output_text', text: 'plan' }] })).toBe('assistant reasoning summary: plan');
    expect(responseItemToTranscript({ type: 'custom_call', foo: 'bar' })).toBe('assistant custom_call: {"type":"custom_call","foo":"bar"}');
    expect(responseItemToTranscript({ type: 'custom_call_output', foo: 'bar' })).toBe('tool output custom_call_output: {"type":"custom_call_output","foo":"bar"}');
    expect(responseItemToTranscript({ role: 'assistant' })).toBe('assistant: {"role":"assistant"}');
    expect(responseItemToTranscript({ type: 'note', value: 1 })).toBe('note: {"type":"note","value":1}');
    expect(responseItemToTranscript({})).toBe('item: {}');
  });

  test('handleToolCalls returns immediately when the response has no output array', async () => {
    const openai = { responses: { create: async () => { throw new Error('unexpected retry'); } } };
    const response = { id: 'resp-empty' };
    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null)).resolves.toBe(response);
  });

  test('status helpers fall back cleanly for undefined timing values', () => {
    expect(formatElapsedStatus(undefined)).toBe('0s');
    expect(formatElapsedStatus(61000)).toBe('1m 1s');
    expect(formatSpinnerFrame(undefined)).toBe('|');
    expect(formatSpinnerFrame(250)).toBe('/');
  });

  test('status line controller uses the default session start time when omitted', () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const controller = createStatusLineController();
      controller.showReasoning();
      expect(stdoutWrites.join('')).toContain('[0s]');
    } finally {
      jest.useRealTimers();
    }
  });

  test('status line controller handles idle, executing, and unchanged refreshes', () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const controller = createStatusLineController(Date.parse('2026-07-08T00:00:00Z'));
      controller.refresh();
      expect(stdoutWrites.join('')).toBe('');

      controller.updateExecuting(1, 2);
      expect(stdoutWrites.join('')).toBe('');

      controller.showReasoning();
      const before = stdoutWrites.length;
      controller.refresh();
      expect(stdoutWrites.length).toBe(before);

      controller.showExecuting(1, 2);
      expect(stdoutWrites.join('')).toContain('[0s]');
      expect(stdoutWrites.join('')).toContain('Executing 1 of 2... 0s');
      controller.refresh();
      expect(stdoutWrites.join('')).toContain('[0s]');
      expect(stdoutWrites.join('')).toContain('Executing 1 of 2... 0s');
    } finally {
      jest.useRealTimers();
    }
  });

  test('transaction completion message formats elapsed time', () => {
    expect(formatTransactionCompletionMessage(9000)).toBe('Transaction completed in 9s.');
    expect(formatTransactionCompletionMessage(61000)).toBe('Transaction completed in 1m 1s.');
  });

  test('createStreamedResponse uses default stream options when omitted', async () => {
    const openai = {
      responses: {
        create: async (request, handlers) => {
          expect(handlers).toBeUndefined();
          expect(request).toEqual({ model: 'test-model' });
          return { id: 'resp-default', output: [] };
        },
      },
    };

    await expect(createStreamedResponse(openai, { model: 'test-model' })).resolves.toEqual({ id: 'resp-default', output: [] });
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

  test('handleToolCalls reports usage when a callback is provided', async () => {
    const usageCalls = [];
    const openai = {
      responses: {
        create: async () => {
          throw new Error('unexpected tool retry');
        },
      },
    };
    const response = {
      id: 'resp-usage',
      output: [],
      usage: { input_tokens: 4, input_tokens_details: { cached_tokens: 1 }, output_tokens: 2 },
    };

    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', (usage) => usageCalls.push(usage))).resolves.toBe(response);

    expect(usageCalls).toEqual([{ inputTokens: 3, cachedTokens: 1, outputTokens: 2 }]);
  });

  test('handleToolCalls prints turn and cumulative usage after each response', async () => {
    const cumulative = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 };
    const openai = {
      responses: {
        create: jest.fn()
          .mockResolvedValueOnce({
            id: 'resp-1',
            output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf \"tool output\"'] } }],
            usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 4 }, output_tokens: 6 },
          })
          .mockResolvedValueOnce({
            id: 'resp-2',
            output: [],
            usage: { input_tokens: 8, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2 },
          }),
      },
    };
    const response = {
      id: 'resp-usage',
      output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf \"tool output\"'] } }],
      usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 4 }, output_tokens: 6 },
    };

    await handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', (usage) => {
      cumulative.inputTokens += usage.inputTokens;
      cumulative.cachedTokens += usage.cachedTokens;
      cumulative.outputTokens += usage.outputTokens;
      cumulative.turns += 1;
      return { ...cumulative };
    }, async () => ({ type: 'shell_call_output', call_id: 'call-1', output: [], status: 'completed', max_output_length: null }));

    const output = stdoutWrites.join('');
    expect(output).toContain('in=6 ($0.000), cache=4 ($0.000), out=6 ($0.000), sum=$0.000');
    expect(output).toContain('in=8 ($0.000), cache=0 ($0.000), out=2 ($0.000), sum=$0.000');
    expect(output).toContain('msgs=2');
  });

  test('handleToolCalls preserves request fields on tool continuations', async () => {
    const template = {
      model: 'test-model',
      input: [],
      text: { format: { type: 'text' }, verbosity: 'low' },
      reasoning: { effort: 'medium', summary: null },
      context_management: [{ type: 'compaction', compact_threshold: 300000 }],
      tools: [],
    };
    const calls = [];
    const tmp = makeTempDir('agentx-handle-tool-');
    try {
      const openai = {
        responses: {
          create: async (request) => {
            calls.push(request);
            if (calls.length === 1) {
              return { id: 'resp-1', model: 'test-model', output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf "tool output"'] } }] };
            }
            return { id: 'resp-2', model: 'test-model', output: [] };
          },
        },
      };

      await sendMessage(openai, template, 'prev-1', 'next', '', '/tmp/work', null, null, { liveStreaming: true });

      expect(calls[1]).toMatchObject({
        model: 'test-model',
        text: { format: { type: 'text' }, verbosity: 'low' },
        reasoning: { effort: 'medium', summary: null },
        context_management: [{ type: 'compaction', compact_threshold: 300000 }],
        previous_response_id: 'resp-1',
        store: true,
        tools: [],
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('handleToolCalls does not emit REST-style debug logs', async () => {
    const originalArgv = [...process.argv];
    const originalConsoleLog = console.log;
    const logs = [];
    process.argv = [...process.argv, '--debug'];
    console.log = (...args) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const openai = {
        responses: {
          create: async () => ({ id: 'resp-next', output: [] }),
        },
      };
      const response = {
        id: 'resp-1',
        output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf "tool output"'] } }],
      };

      await handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, async () => ({ type: 'shell_call_output', call_id: 'call-1', output: [], status: 'completed', max_output_length: null }));

      expect(logs.some((line) => line.includes('OpenAI request:'))).toBe(false);
      expect(logs.some((line) => line.includes('OpenAI response:'))).toBe(false);
    } finally {
      process.argv = originalArgv;
      console.log = originalConsoleLog;
    }
  });

  test('sendMessage streams live output, streamed arguments, and reasoning transcripts', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const calls = [];
    const openai = {
      responses: {
        create: async (request, handlers) => {
          calls.push({ request, handlers: Boolean(handlers) });
          handlers?.onTextDelta(undefined);
          handlers?.onTextDelta('Hi');
          handlers?.onTextDelta(' there');
          handlers?.onEvent?.(
            { type: 'response.function_call_arguments.delta', delta: '{"p":[{"s":["echo ' },
            { raw: '{"type":"response.function_call_arguments.delta","delta":"{\\"p\\":[{\\"s\\":[\\"echo "}', json: { type: 'response.function_call_arguments.delta', delta: '{"p":[{"s":["echo ' } },
          );
          handlers?.onEvent?.(
            { type: 'response.function_call_arguments.delta', delta: 'live"]}]}'},
            { raw: '{"type":"response.function_call_arguments.delta","delta":"live\\"]}]}"}', json: { type: 'response.function_call_arguments.delta', delta: 'live"]}]}' } },
          );
          handlers?.onItemDone({ type: 'function_call', name: 'shell_call', call_id: 'call-1', arguments: '{"p":[{"s":["echo live"]}]}' });
          handlers?.onItemDone({ type: 'reasoning', summary: [] });
          handlers?.onItemDone({ type: 'reasoning', summary: [{ type: 'input_text', text: 'thinking' }] });
          handlers?.onEvent?.(
            { type: 'response.completed', response: { id: 'resp-live', output: [] } },
            { raw: '{"type":"response.completed","response":{"id":"resp-live","output":[]}}', json: { type: 'response.completed', response: { id: 'resp-live', output: [] } } },
          );
          return { id: 'resp-live', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work', null, null, { liveStreaming: true });

    expect(calls).toHaveLength(1);
    expect(calls[0].handlers).toBe(true);
    expect(stdoutWrites.join('')).toContain('Hi there');
    expect(stdoutWrites.join('')).toContain('\u001b[32m{"p":[{"s":["echo ');
    expect(stdoutWrites.join('')).toContain('\u001b[32mlive"]}]}');
    expect(stdoutWrites.join('')).toContain('\n');
    expect(stdoutWrites.join('')).not.toContain('response.output_item.added');
    expect(stdoutWrites.join('')).not.toContain('response.output_item.done');
    expect(stdoutWrites.join('')).not.toContain('response.completed');
    expect(stdoutWrites.join('')).toContain('assistant reasoning summary: thinking');
  });

  test('sendMessage ignores unrelated live events and empty streamed deltas', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers?.onEvent?.({ type: 'response.output_item.added' }, { raw: '{"type":"response.output_item.added"}' });
          handlers?.onEvent?.({ type: 'response.function_call_arguments.delta', delta: '' }, { raw: '{"type":"response.function_call_arguments.delta","delta":""}' });
          handlers?.onEvent?.({ type: 'response.function_call_arguments.delta' }, { raw: '{"type":"response.function_call_arguments.delta"}' });
          return { id: 'resp-live', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work', null, null, { liveStreaming: true });

    expect(stdoutWrites.join('')).not.toContain('response.output_item.added');
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

    expect(stdoutWrites.join('')).toContain('done\n');
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

    expect(stdoutWrites.join('')).toContain('done\n');
    expect(stdoutWrites.join('')).not.toContain('done\n\n');
  });

  test('sendMessage shows a reasoning spinner until the first streamed delta and formats long waits as minutes', async () => {
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

      expect(stdoutWrites.join('')).toContain('[0s] | Reasoning... 0s');

      await jest.advanceTimersByTimeAsync(250);
      expect(stdoutWrites.join('')).toContain('[0s] / Reasoning... 0s');

      jest.setSystemTime(Date.parse('2026-07-08T00:01:00Z'));
      await jest.advanceTimersByTimeAsync(250);
      expect(stdoutWrites.join('')).toContain('1m 0s');

      handlers.onTextDelta('Hi');
      resolveResponse({ id: 'resp-live', output: [] });
      await pending;

      expect(stdoutWrites.join('')).toContain('Hi');
      expect(stdoutWrites.join('')).toContain('\r');
    } finally {
      jest.useRealTimers();
    }
  });

  test('handleToolCalls shows executing progress and resumes reasoning for the follow-up response', async () => {
    const openai = {
      responses: {
        create: jest.fn()
          .mockResolvedValueOnce({
            id: 'resp-1',
            output: [
              { type: 'shell_call', call_id: 'call-1', action: { commands: ['one'] } },
              { type: 'shell_call', call_id: 'call-2', action: { commands: ['two'] } },
            ],
            usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 1 }, output_tokens: 2 },
          })
          .mockResolvedValueOnce({
            id: 'resp-2',
            output: [],
            usage: { input_tokens: 4, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1 },
          }),
      },
    };
    const response = {
      id: 'resp-1',
      output: [
        { type: 'shell_call', call_id: 'call-1', action: { commands: ['one'] } },
        { type: 'shell_call', call_id: 'call-2', action: { commands: ['two'] } },
      ],
      usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 1 }, output_tokens: 2 },
    };

    const runToolCallFn = async (call) => await new Promise((resolve) => {
      setTimeout(() => resolve({ type: 'shell_call_output', call_id: call.call_id, output: [], status: 'completed', max_output_length: null }), call.call_id === 'call-1' ? 50 : 100);
    });

    const pending = handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, runToolCallFn, { liveStreaming: true });

    expect(stdoutWrites.join('')).toContain('[0s] | Executing 0 of 2... 0s');

    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(stdoutWrites.join('')).toContain('[0s] | Executing 1 of 2... 0s');

    await pending;
    expect(stdoutWrites.join('')).toContain('[0s] | Executing 2 of 2... 0s');
    expect(stdoutWrites.join('')).toContain('[0s] | Reasoning... 0s');
  });

  test('handleToolCalls processes shell_call function calls', async () => {
    const createCalls = [];
    const openai = {
      responses: {
        create: async (request) => {
          createCalls.push(request);
          return { id: 'resp-next', output: [] };
        },
      },
    };
    const response = {
      id: 'resp-1',
      output: [{ type: 'function_call', call_id: 'call-1', name: 'shell_call', input: JSON.stringify({ c: '/tmp/work', p: [{ s: ['printf hi'] }] }) }],
    };

    const runToolCallFn = async (call) => {
      expect(call.type).toBe('function_call');
      expect(call.name).toBe('shell_call');
      return JSON.stringify({ call_id: call.call_id, cwd: '/tmp/work', status: 'completed', groups: [] });
    };

    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, runToolCallFn)).resolves.toEqual({ id: 'resp-next', output: [] });

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].input).toHaveLength(1);
    expect(createCalls[0].input[0]).toMatchObject({ type: 'function_call_output', call_id: 'call-1' });
  });

  test('handleToolCalls runs multiple tool calls in parallel and preserves output order', async () => {
    const createCalls = [];
    const openai = {
      responses: {
        create: async (request) => {
          createCalls.push(request);
          return { id: 'resp-next', output: [] };
        },
      },
    };
    const response = {
      id: 'resp-1',
      usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1 },
      output: [
        { type: 'shell_call', call_id: 'call-1', action: { commands: ['one'] } },
        { type: 'shell_call', call_id: 'call-2', action: { commands: ['two'] } },
      ],
    };

    let active = 0;
    let maxActive = 0;
    const runToolCallFn = async (call) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, call.call_id === 'call-1' ? 80 : 20));
      active -= 1;
      return { type: 'shell_call_output', call_id: call.call_id, output: [{ stdout: `output-${call.call_id}`, stderr: '', outcome: { type: 'exit', exit_code: 0 } }], status: 'completed', max_output_length: null };
    };

    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, runToolCallFn)).resolves.toEqual({ id: 'resp-next', output: [] });

    expect(maxActive).toBe(2);
    expect(stdoutWrites.join('')).not.toContain('\u001b[32mone\u001b[0m\n');
    expect(stdoutWrites.join('')).not.toContain('\u001b[32mtwo\u001b[0m\n');
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].input.map((item) => item.call_id)).toEqual(['call-1', 'call-2']);
  });

  test('extractUsage is re-exported from agent-session', () => {
    expect(extractUsage({ usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 1 }, output_tokens: 3 } })).toEqual({ inputTokens: 1, cachedTokens: 1, outputTokens: 3 });
  });

  test('readSessionState falls back to legacy response id text', async () => {
    const tmp = makeTempDir('agentx-state-');
    const file = makeFile(tmp, '.agentx_responseid', 'resp-legacy\n');
    await expect(readSessionState(file)).resolves.toEqual({ response_id: 'resp-legacy', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [], pending_response_usage: null });
    cleanupTempDir(tmp);
  });

  test('formatUsageSummary renders usage stats', () => {
    expect(formatUsageSummary({ usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 1 }, output_tokens: 3 } })).toBe('in=1 ($0.000), cache=1 ($0.000), out=3 ($0.000), sum=$0.000, msgs=1, avg=$0.000');
  });

  test('responseItemToTranscript formats shell_call function call inputs', () => {
    expect(responseItemToTranscript({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ c: '/tmp/work', p: [{ s: ['printf hi'] }] }) })).toBe('assistant shell call: {"c":"/tmp/work","p":[{"s":["printf hi"]}]}');
  });

  test('responseItemToTranscript formats shell_call function call arguments fields', () => {
    expect(responseItemToTranscript({ type: 'function_call', name: 'shell_call', arguments: JSON.stringify({ c: '/tmp/work', p: [{ s: ['printf hi'] }] }) })).toBe('assistant shell call: {"c":"/tmp/work","p":[{"s":["printf hi"]}]}');
  });

  test('responseItemToTranscript falls back to an empty shell_call preview when no payload is present', () => {
    expect(responseItemToTranscript({ type: 'function_call', name: 'shell_call' })).toBe('assistant shell call: {}');
  });

  test('responseItemToTranscript falls back to raw shell_call arguments when JSON parsing fails', () => {
    expect(responseItemToTranscript({ type: 'function_call', name: 'shell_call', arguments: '{not valid json' })).toBe('assistant shell call: {not valid json');
  });

  test('responseItemToTranscript formats message content, tool calls, and outputs', () => {
    expect(responseItemToTranscript({
      role: 'assistant',
      type: 'message',
      content: [
        { type: 'input_text', text: 'line one' },
        { type: 'output_text', text: 'line two' },
        { type: 'refusal', refusal: 'nope' },
      ],
    })).toBe(`assistant: line one
line two
[refusal] nope`);

    expect(responseItemToTranscript({ type: 'function_call', name: 'custom_tool', arguments: '{"x":1}' })).toBe('assistant tool call: custom_tool({"x":1})');
    expect(responseItemToTranscript({ type: 'function_call', input: 'payload' })).toBe('assistant tool call: function(payload)');
    expect(responseItemToTranscript({ type: 'shell_call', call_id: 'call-99', action: { commands: ['echo hi'] }, status: 'completed' })).toBe('assistant shell call: {"call_id":"call-99","action":{"commands":["echo hi"]},"status":"completed"}');
    expect(responseItemToTranscript({ type: 'function_call_output', output: 'ok' })).toBe('tool output: ok');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', max_output_length: 12, status: 'completed', output: [{ stdout: 'abc', stderr: 'def', outcome: { type: 'exit', exit_code: 0 } }] })).toBe('tool output shell_call_output: {"call_id":"call-1","max_output_length":12,"status":"completed","output":[{"stdout":"abc","stderr":"def","outcome":{"type":"exit","exit_code":0}}]}');
    expect(responseItemToTranscript({ type: 'custom_call', call_id: 'call-2', input: '{"a":1}' })).toBe(`assistant custom_call: ${JSON.stringify({ type: 'custom_call', call_id: 'call-2', input: '{"a":1}' })}`);
    expect(responseItemToTranscript({ type: 'custom_call_output', call_id: 'call-3', output: [1, { stdout: 'ok', stderr: '', outcome: null }] })).toBe('tool output custom_call_output: {"type":"custom_call_output","call_id":"call-3","output":[1,{"stdout":"ok","stderr":"","outcome":null}]}');
    expect(responseItemToTranscript({ type: 'custom_call_output', call_id: 'call-4', output: [{}], encrypted_content: 'secret', result: 'x'.repeat(501) })).toContain('[encrypted reasoning omitted]');
    expect(responseItemToTranscript({ type: 'custom_call_output', call_id: 'call-4', output: [{}], encrypted_content: 'secret', result: 'x'.repeat(501) })).toContain('[large result omitted: 501 chars]');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-5' })).toBe('tool output shell_call_output: {"call_id":"call-5","output":[]}');
    expect(responseItemToTranscript({ type: 'message', content: [{ type: 'input_text' }, { type: 'output_text' }, { type: 'refusal', refusal: 'nope' }] })).toBe('message: [refusal] nope');
    expect(responseItemToTranscript({ type: 'message', content: [] })).toBe('');
    expect(responseItemToTranscript({ type: 'note', message: 'fallback' })).toBe('note: {"type":"note","message":"fallback"}');
  });

  test('responseItemToTranscript omits developer text and serializes user text', () => {
    expect(responseItemToTranscript({ role: 'developer', type: 'message', content: [{ type: 'input_text', text: 'secret' }] })).toBe('');
    expect(responseItemToTranscript({ role: 'user', type: 'message', content: [{ type: 'input_text', text: 'hello' }] })).toBe('user: hello');
  });
});
