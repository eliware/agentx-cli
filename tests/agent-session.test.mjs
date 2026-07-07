import { describe, expect, test } from '@jest/globals';
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

      await sendMessage(openai, template, 'prev-1', 'next', '', '/tmp/work');

      expect(stdoutWrites.join('')).toContain('shell_call printf "tool output"...');
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
    expect(stdoutWrites.join('')).toContain('shell_call one... OK!');
    expect(stdoutWrites.join('')).toContain('shell_call two... OK!');
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

  test('responseItemToTranscript omits developer text and serializes user text', () => {
    expect(responseItemToTranscript({ role: 'developer', type: 'message', content: [{ type: 'input_text', text: 'secret' }] })).toBe('');
    expect(responseItemToTranscript({ role: 'user', type: 'message', content: [{ type: 'input_text', text: 'hello' }] })).toBe('user: hello');
  });
});
