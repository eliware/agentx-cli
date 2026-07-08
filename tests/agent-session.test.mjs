import { describe, expect, jest, test } from '@jest/globals';
import { buildInputMessage } from '../src/prompt-builder.mjs';
import { formatUsageSummary, handleToolCalls, responseItemToTranscript, sendMessage, extractUsage, readSessionState } from '../src/agent-session.mjs';
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

  test('handleToolCalls prints usage stats on tool retriggers', async () => {
    const openai = {
      responses: {
        create: async () => ({ id: 'resp-next', output: [] }),
      },
    };
    const response = {
      id: 'resp-usage',
      output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf \"tool output\"'] } }],
      usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 4 }, output_tokens: 6 },
    };

    await handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, async () => ({ type: 'shell_call_output', call_id: 'call-1', output: [], status: 'completed', max_output_length: null }));

    expect(stdoutWrites.join('')).toContain('in=6 ($0.000), cache=4 ($0.000), out=6 ($0.000), sum=$0.000');
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

  test('handleToolCalls logs debug request and response around tool continuations', async () => {
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

      expect(logs.some((line) => line.includes('OpenAI request:'))).toBe(true);
      expect(logs.some((line) => line.includes('previous_response_id'))).toBe(true);
      expect(logs.some((line) => line.includes('OpenAI response:'))).toBe(true);
      expect(logs.some((line) => line.includes('resp-next'))).toBe(true);
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
    await expect(readSessionState(file)).resolves.toEqual({ response_id: 'resp-legacy', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '' });
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

  test('responseItemToTranscript falls back to raw shell_call input when JSON parsing fails', () => {
    expect(responseItemToTranscript({ type: 'function_call', name: 'shell_call', input: '{not valid json' })).toBe('assistant shell call: {not valid json');
  });

  test('responseItemToTranscript omits developer text and serializes user text', () => {
    expect(responseItemToTranscript({ role: 'developer', type: 'message', content: [{ type: 'input_text', text: 'secret' }] })).toBe('');
    expect(responseItemToTranscript({ role: 'user', type: 'message', content: [{ type: 'input_text', text: 'hello' }] })).toBe('user: hello');
  });
});
