import { describe, expect, jest, test } from '@jest/globals';
import { createStreamedResponse } from '../src/agent-session/response-stream.mjs';

describe('agent session modules', () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => { stdoutWrites.push(String(chunk)); return true; };
  });

  afterEach(() => { process.stdout.write = originalStdoutWrite; });

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
  test('streams output, clears status, and appends a newline when needed', async () => {
    const statusController = { showReasoning: jest.fn(), beginWriting: jest.fn(), clear: jest.fn() };
    const openai = { responses: { create: async (_request, handlers) => { handlers.onTextDelta('hello'); return { id: 'resp-live' }; } } };
    await expect(createStreamedResponse(openai, {}, { liveStreaming: true, statusController })).resolves.toEqual({ id: 'resp-live' });
    expect(statusController.showReasoning).toHaveBeenCalled();
    expect(statusController.clear).toHaveBeenCalled();
    expect(stdoutWrites.join('')).toBe('hello\n');
  });

  test('does not append a newline when streamed output already ends with one', async () => {
    const statusController = { showReasoning: jest.fn(), beginWriting: jest.fn(), clear: jest.fn() };
    const openai = { responses: { create: async (_request, handlers) => { handlers.onTextDelta('hello\n'); return { id: 'resp-live' }; } } };
    await createStreamedResponse(openai, {}, { liveStreaming: true, statusController });
    expect(stdoutWrites.join('')).toBe('hello\n');
  });

  test('clears status when the response request fails', async () => {
    const statusController = { showReasoning: jest.fn(), clear: jest.fn() };
    const error = new Error('transport failed');
    const openai = { responses: { create: async () => { throw error; } } };
    await expect(createStreamedResponse(openai, {}, { liveStreaming: true, statusController })).rejects.toBe(error);
    expect(statusController.clear).toHaveBeenCalledTimes(1);
  });

  test('logs raw events in debug mode', async () => {
    const originalStderrWrite = process.stderr.write;
    const stderrWrites = [];
    process.stderr.write = (chunk) => { stderrWrites.push(String(chunk)); return true; };
    try {
      const openai = { responses: { create: async (_request, handlers) => { handlers.onEvent({ type: 'response.completed' }, { raw: '{"type":"response.completed"}' }); handlers.onEvent({ type: 'response.test' }); return { id: 'resp-debug' }; } } };
      await createStreamedResponse(openai, {}, { debug: true });
      expect(stderrWrites.join('')).toContain('[openai:event] {"raw":"{\\"type\\":\\"response.completed\\"}"}');
    } finally { process.stderr.write = originalStderrWrite; }
  });

});
