import { describe, expect, jest, test } from '@jest/globals';
import { handleToolCalls } from '../src/agent-session/tool-loop.mjs';
import { sendMessage } from '../src/agent-session/session-service.mjs';
import { cleanupTempDir, makeTempDir } from './test-helpers.mjs';

describe('agent session modules', () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => { stdoutWrites.push(String(chunk)); return true; };
  });

  afterEach(() => { process.stdout.write = originalStdoutWrite; });

  test('handleToolCalls returns immediately when the response has no output array', async () => {
    const openai = { responses: { create: async () => { throw new Error('unexpected retry'); } } };
    const response = { id: 'resp-empty' };
    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null)).resolves.toBe(response);
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
  test('passes the caller response predecessor to image inspection', async () => {
    const predecessors = [];
    const openai = { responses: { create: jest.fn().mockResolvedValue({ id: 'resp-after-image', output: [] }) } };
    const response = { id: 'resp-image-call', output: [{ type: 'function_call', name: 'view_image', call_id: 'image-1', arguments: '{}' }] };
    await handleToolCalls(openai, response, { model: 'test-model', tools: [], previous_response_id: 'resp-before-image' }, '/tmp/work', null, undefined, {
      onViewImage: async ({ previousResponseId }) => { predecessors.push(previousResponseId); return 'image result'; },
    });
    expect(predecessors).toEqual(['resp-before-image']);
    expect(openai.responses.create.mock.calls[0][0]).toMatchObject({ previous_response_id: 'resp-image-call', input: [{ type: 'function_call_output', call_id: 'image-1', output: 'image result' }] });
  });
  test('persists failed tool continuation for retry', async () => {
    const retryStates = [];
    const openai = { responses: { create: jest.fn().mockRejectedValue(new Error('overloaded')) } };
    const response = { id: 'resp-tool', output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf output'] } }] };
    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, async () => ({ type: 'shell_call_output', call_id: 'call-1', output: [], status: 'completed' }), { onRetryState: async (state) => retryStates.push(state) })).rejects.toThrow('overloaded');
    expect(retryStates).toHaveLength(1);
    expect(retryStates[0].request).toMatchObject({ previous_response_id: 'resp-tool', store: true, input: [{ call_id: 'call-1' }] });
  });
  test('handleToolCalls prints turn and cumulative usage after each response', async () => {
    const cumulative = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 };
    const openai = {
      responses: {
        create: jest.fn()
          .mockResolvedValueOnce({
            id: 'resp-1',
            output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf "tool output"'] } }],
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
      output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf "tool output"'] } }],
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
    expect(output).toContain('{"in":"6 ($0.000)","cache":"4 ($0.000)","out":"6 ($0.000)","total":"$0.000"}');
    expect(output).toContain('{"in":"12 ($0.000)","cache":"8 ($0.000)","out":"12 ($0.000)","turns":"2","avg":"$0.000","total":"$0.000"}');
  });
  test('handleToolCalls can skip initial usage accounting on the first response', async () => {
    const stateCalls = [];
    const openai = {
      responses: {
        create: async () => ({ id: 'resp-skip', output: [] }),
      },
    };
    const response = { id: 'resp-skip', output: [], usage: { input_tokens: 9, input_tokens_details: { cached_tokens: 2 }, output_tokens: 4 } };

    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, undefined, { skipInitialUsageAccounting: true, onResponseState: async (snapshot) => stateCalls.push(snapshot) })).resolves.toBe(response);

    expect(stateCalls).toHaveLength(1);
    expect(stateCalls[0].cumulativeUsage).toBeNull();
  });
  test('handleToolCalls invokes onResponseState with the current response snapshot', async () => {
    const stateCalls = [];
    const openai = {
      responses: {
        create: async () => ({ id: 'resp-state', output: [] }),
      },
    };
    const response = { id: 'resp-state', output: [], usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0 } };

    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, undefined, { onResponseState: async (snapshot) => stateCalls.push(snapshot) })).resolves.toBe(response);

    expect(stateCalls).toHaveLength(1);
    expect(stateCalls[0]).toMatchObject({ response, pendingToolCalls: [], isInitialResponse: true });
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

    expect(stdoutWrites.join('')).toContain('{"time":"0s","reasoning":"0s/0s","writing":"0s/0s",\u001b[32m"executing":"0s/0s"\u001b[0m');

    await new Promise((resolve) => setTimeout(resolve, 70));

    await pending;
    const output = stdoutWrites.join('');
    expect(output).toContain('\u001b[32m"executing":"0s/0s"\u001b[0m');
    expect(output).toContain('\u001b[94m{"time":');
  });
  test('handleToolCalls refuses unconfirmed state-changing calls', async () => {
    const openai = { responses: { create: jest.fn(async (request) => ({ id: 'resp-next', output: [], request })) } };
    const response = { id: 'resp-1', usage: { input_tokens: 1, output_tokens: 1 }, output: [
      { type: 'shell_call', call_id: 'call-danger', action: { commands: ['shutdown now'] } },
      { type: 'shell_call', id: 'call-danger-id', action: { commands: ['reboot now'] } },
      { type: 'shell_call', action: { commands: ['poweroff now'] } },
    ] };
    const runToolCallFn = jest.fn();
    await handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, runToolCallFn, { confirmToolCall: async () => false });
    expect(runToolCallFn).not.toHaveBeenCalled();
    expect(openai.responses.create.mock.calls[0][0].input).toHaveLength(3);
    expect(openai.responses.create.mock.calls[0][0].input.every((item) => item.status === 'incomplete')).toBe(true);
  });
  test('handleToolCalls executes duplicate calls only once', async () => {
    const createCalls = [];
    const openai = { responses: { create: async (request) => { createCalls.push(request); return { id: 'resp-next', output: [] }; } } };
    const response = { id: 'resp-1', usage: { input_tokens: 1, output_tokens: 1 }, output: [
      { type: 'shell_call', call_id: 'call-1', action: { commands: ['one'] } },
      { type: 'shell_call', call_id: 'call-1', action: { commands: ['one'] } },
    ] };
    const runToolCallFn = jest.fn(async (call) => ({ type: 'shell_call_output', call_id: call.call_id, output: [], status: 'completed' }));

    await handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, runToolCallFn);

    expect(runToolCallFn).toHaveBeenCalledTimes(1);
    expect(createCalls[0].input).toHaveLength(1);
  });
  test('handleToolCalls dispatches worker function calls', async () => {
    const openai = { responses: { create: async () => ({ id: 'resp-next', output: [] }) } };
    const response = { id: 'resp-1', usage: { input_tokens: 1, output_tokens: 1 }, output: [
      { type: 'function_call', name: 'agent_status', call_id: 'worker-status', arguments: JSON.stringify({ agent_ids: ['missing-agent'] }) },
    ] };
    const runToolCallFn = jest.fn(async () => ({ agents: [{ id: 'missing-agent', status: 'unknown' }], waited: false, timed_out: false }));
    await expect(handleToolCalls(openai, response, { model: 'test-model', tools: [] }, '/tmp/work', null, runToolCallFn)).resolves.toEqual({ id: 'resp-next', output: [] });
    expect(runToolCallFn).toHaveBeenCalledTimes(1);
  });
  test('handleToolCalls runs multiple tool calls sequentially and preserves output order', async () => {
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

    expect(maxActive).toBe(1);
    expect(stdoutWrites.join('')).not.toContain('[32mone[0m\n');
    expect(stdoutWrites.join('')).not.toContain('[32mtwo[0m\n');
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].input.map((item) => item.call_id)).toEqual(['call-1', 'call-2']);
  });
});
