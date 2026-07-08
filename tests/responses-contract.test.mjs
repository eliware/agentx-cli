import { describe, expect, test } from '@jest/globals';
import { extractTextFromResponse, extractUsage } from '../src/response.mjs';
import { responseItemToTranscript } from '../src/agent-session.mjs';
import { toolOutputForCall } from '../src/tool-dispatch.mjs';

describe('responses contract', () => {
  test('parses current Responses API shapes used by AgentX', () => {
    const response = {
      id: 'resp-123',
      output: [
        { type: 'reasoning', summary: [{ type: 'output_text', text: 'plan' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'final answer' }] },
        { type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'], timeout_ms: 1000, max_output_length: 1000 }, status: 'completed' },
        { type: 'shell_call_output', call_id: 'call-1', status: 'completed', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] },
      ],
      usage: {
        input_tokens: 17,
        input_tokens_details: { cached_tokens: 5 },
        output_tokens: 9,
      },
    };

    expect(extractTextFromResponse(response)).toBe('final answer');
    expect(extractUsage(response)).toEqual({ inputTokens: 12, cachedTokens: 5, outputTokens: 9 });
    expect(responseItemToTranscript(response.output[0])).toBe('assistant reasoning summary: plan');
    expect(responseItemToTranscript(response.output[2])).toContain('assistant shell call:');
    expect(responseItemToTranscript(response.output[3])).toContain('tool output shell_call_output:');
    expect(toolOutputForCall(response.output[2], { type: 'shell_call_output', call_id: 'call-1', status: 'completed', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] })).toMatchObject({ type: 'shell_call_output', call_id: 'call-1' });
  });
});
