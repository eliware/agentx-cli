import { describe, expect, test } from '@jest/globals';
import { extractUsage } from '../src/response.mjs';
import { responseItemToTranscript } from '../src/agent-session/response-format.mjs';
import { readSessionState } from '../src/session-state.mjs';
import { cleanupTempDir, makeFile, makeTempDir } from './test-helpers.mjs';

describe('agent session modules', () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => { stdoutWrites.push(String(chunk)); return true; };
  });

  afterEach(() => { process.stdout.write = originalStdoutWrite; });

  test('responseItemToTranscript covers the remaining item shapes', () => {
    expect(responseItemToTranscript({ role: 'assistant', type: 'message', content: [{ type: 'input_text' }, { type: 'output_text' }, { type: 'refusal', refusal: '' }, { text: 'gamma' }] })).toBe('assistant: gamma');
    expect(responseItemToTranscript({ type: 'message', content: [{ type: 'input_text', text: '' }, { type: 'output_text', text: '' }] })).toBe('');
    expect(responseItemToTranscript({ type: 'function_call', name: 'other_tool', input: 'abc' })).toBe('assistant tool call: other_tool(abc)');
    expect(responseItemToTranscript({ type: 'function_call', name: 'other_tool' })).toBe('assistant tool call: other_tool()');
    expect(responseItemToTranscript({ type: 'message', content: undefined })).toBe('');
    expect(responseItemToTranscript({ type: 'function_call_output', output: null })).toBe('tool output: ');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', output: [{ stdout: 'x'.repeat(200), stderr: 'y'.repeat(200), outcome: { type: 'exit', exit_code: 0 } }, 'ignored'], max_output_length: 10, status: 'completed' })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'reasoning', summary: [] })).toBe('');
    expect(responseItemToTranscript({ type: 'reasoning' })).toBe('');
    expect(responseItemToTranscript({ type: 'reasoning', summary: [{ type: 'output_text', text: 'plan' }] })).toBe('plan');
    expect(responseItemToTranscript({ type: 'custom_call', foo: 'bar' })).toBe('assistant custom_call: {"type":"custom_call","foo":"bar"}');
    expect(responseItemToTranscript({ type: 'custom_call_output', foo: 'bar' })).toBe('tool output custom_call_output: {"type":"custom_call_output","foo":"bar"}');
    expect(responseItemToTranscript({ role: 'assistant' })).toBe('assistant: {"role":"assistant"}');
    expect(responseItemToTranscript({ type: 'note', value: 1 })).toBe('note: {"type":"note","value":1}');
    expect(responseItemToTranscript({})).toBe('item: {}');
  });
  test('extractUsage is re-exported from agent-session', () => {
    expect(extractUsage({ usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 1 }, output_tokens: 3 } })).toEqual({ inputTokens: 1, cachedTokens: 1, outputTokens: 3 });
  });
  test('readSessionState falls back to legacy response id text', async () => {
    const tmp = makeTempDir('agentx-state-');
    const file = makeFile(tmp, '.agentx_responseid', 'resp-legacy\n');
    await expect(readSessionState(file)).resolves.toEqual({ response_id: 'resp-legacy', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [] });
    cleanupTempDir(tmp);
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
