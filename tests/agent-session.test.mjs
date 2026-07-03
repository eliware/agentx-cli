import { describe, expect, test } from '@jest/globals';
import { buildInputMessage } from '../src/prompt.mjs';
import { compactSession, formatUsageSummary, isContextWindowExceeded, responseItemToTranscript, sendMessage, extractUsage, readSessionState } from '../src/agent-session.mjs';
import { cleanupTempDir, makeFile, makeTempDir } from './test-helpers.mjs';

describe('agent session helpers', () => {
  test('sendMessage uses first-message templating on a fresh session', async () => {
    const template = {
      model: 'test-model',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
      ],
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

  test('extractUsage is re-exported from agent-session', () => {
    expect(extractUsage({ usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 1 }, output_tokens: 3 } })).toEqual({ inputTokens: 1, cachedTokens: 1, outputTokens: 3 });
  });

  test('readSessionState falls back to legacy response id text', async () => {
    const tmp = makeTempDir('agentx-state-');
    const file = makeFile(tmp, '.agentx_responseid', 'resp-legacy\n');
    await expect(readSessionState(file)).resolves.toEqual({ response_id: 'resp-legacy', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 } });
    cleanupTempDir(tmp);
  });

  test('formatUsageSummary renders usage stats', () => {
    expect(formatUsageSummary({ usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 1 }, output_tokens: 3 } })).toBe('in=1 ($0.000), cache=1 ($0.000), out=3 ($0.000), sum=$0.000, msgs=1, avg=$0.000');
  });

  test('isContextWindowExceeded recognizes OpenAI context errors', () => {
    expect(isContextWindowExceeded({ status: 400, code: 'context_length_exceeded' })).toBe(true);
    expect(isContextWindowExceeded({ status: 400, message: 'Your input exceeds the context window of this model.' })).toBe(true);
    expect(isContextWindowExceeded({ status: 500, message: 'server error' })).toBe(false);
  });

  test('responseItemToTranscript omits developer text and serializes user text', () => {
    expect(responseItemToTranscript({ role: 'developer', type: 'message', content: [{ type: 'input_text', text: 'secret' }] })).toBe('');
    expect(responseItemToTranscript({ role: 'user', type: 'message', content: [{ type: 'input_text', text: 'hello' }] })).toBe('user: hello');
  });

  test('compactSession summarizes old context and retries pending message in a fresh session', async () => {
    const template = {
      model: 'test-model',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
      ],
      tools: [],
    };
    const calls = [];
    const openai = {
      responses: {
        inputItems: {
          list: async function* (responseId) {
            if (responseId === 'resp-1') yield { role: 'user', type: 'message', content: [{ type: 'input_text', text: 'old question' }] };
            if (responseId === 'resp-2') yield { role: 'user', type: 'message', content: [{ type: 'input_text', text: 'recent question' }] };
          },
        },
        retrieve: async (responseId) => responseId === 'resp-2'
          ? { id: 'resp-2', previous_response_id: 'resp-1', output: [{ role: 'assistant', type: 'message', content: [{ type: 'output_text', text: 'recent answer' }] }] }
          : { id: 'resp-1', previous_response_id: null, output: [{ role: 'assistant', type: 'message', content: [{ type: 'output_text', text: 'old answer' }] }] },
        create: async (request) => {
          calls.push(request);
          if (request.store === false) return { id: 'summary', output: [{ type: 'message', content: [{ type: 'output_text', text: 'summary text' }] }], usage: { input_tokens: 3, output_tokens: 4 } };
          return { id: 'resp-new', model: request.model, output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }], usage: { input_tokens: 5, output_tokens: 6 } };
        },
      },
    };

    const usage = [];
    const compacted = await compactSession(openai, template, 'resp-2', 'AGENTS body', '/tmp/work', 'retry this', (item) => usage.push(item));

    expect(compacted.response.id).toBe('resp-new');
    expect(calls[0].store).toBe(false);
    expect(calls[1].previous_response_id).toBeUndefined();
    expect(calls[1].input[0].content[0].text).toContain('AGENTS body');
    expect(calls[1].input.at(-1).content[0].text).toBe('retry this');
    expect(calls[1].input.map((item) => item.content?.[0]?.text).join('\n')).toContain('summary text');
    expect(usage).toHaveLength(2);
  });
});
