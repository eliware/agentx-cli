import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { spawn as realSpawn } from 'node:child_process';

const encodeImageInput = jest.fn();
const extractTextFromResponse = jest.fn();
const extractUsage = jest.fn((response) => ({ inputTokens: Number(response?.usage?.input_tokens ?? 0) - Number(response?.usage?.input_tokens_details?.cached_tokens ?? 0), cachedTokens: Number(response?.usage?.input_tokens_details?.cached_tokens ?? 0), outputTokens: Number(response?.usage?.output_tokens ?? 0) }));
const saveGeneratedImage = jest.fn();
const spawn = jest.fn();

await jest.unstable_mockModule('node:child_process', () => ({ spawn }));

await jest.unstable_mockModule('../src/image-input.mjs', () => ({ encodeImageInput }));
await jest.unstable_mockModule('../src/response.mjs', () => ({ extractTextFromResponse, extractUsage }));
await jest.unstable_mockModule('../src/image-generation.mjs', () => ({ saveGeneratedImage }));

const { inspectImage, runImageInspection } = await import('../src/image-inspector.mjs');

describe('image inspection', () => {
  function mockWorker({ stdout = '', stderr = '', code = 0, error } = {}) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', stdout);
        if (stderr) child.stderr.emit('data', stderr);
        if (error) child.emit('error', error);
        else child.emit('close', code);
      });
      return child;
    });
  }

  beforeEach(() => {
    spawn.mockReset();
    spawn.mockImplementation((...args) => realSpawn(...args));
    encodeImageInput.mockReset();
    extractTextFromResponse.mockReset();
    extractUsage.mockClear();
    saveGeneratedImage.mockReset();
  });

  test('runs validation through an isolated image worker process', async () => {
    mockWorker({ stdout: JSON.stringify({ text: 'validated', usage: { turns: 1 } }) });
    const usage = [];
    await expect(inspectImage({}, { prompt: 'Inspect', images: [{ path: 'x' }] }, {
      cwd: process.cwd(), responseId: 'resp', model: 'model', processWorker: true, onUsage: value => usage.push(value),
    })).resolves.toBe('validated');
    expect(usage).toEqual([{ turns: 1 }]);
  });

  test('serializes concurrent workers sharing a branch parent', async () => {
    mockWorker({ stdout: JSON.stringify({ text: 'first' }) });
    mockWorker({ stdout: JSON.stringify({ error: 'second' }) });
    const options = { cwd: process.cwd(), responseId: 'resp', previousResponseId: 'parent', model: 'model', processWorker: true };
    const results = await Promise.all([
      inspectImage({}, { prompt: 'Inspect', images: [{ path: 'x' }] }, options),
      inspectImage({}, { prompt: 'Inspect', images: [{ path: 'x' }] }, options),
    ]);
    expect(results).toEqual(['first', 'second']);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  test('continues after a rejected queued worker', async () => {
    spawn.mockImplementationOnce(() => { throw new Error('worker launch failed'); });
    const first = inspectImage({}, {}, { processWorker: true, cwd: '/queue' });
    mockWorker({ stdout: JSON.stringify({ text: 'recovered' }) });
    const second = inspectImage({}, {}, { processWorker: true, cwd: '/queue' });
    await expect(first).rejects.toThrow('worker launch failed');
    await expect(second).resolves.toBe('recovered');
  });

  test('handles worker errors, nonzero exits, and malformed output', async () => {
    mockWorker({ error: new Error('spawn failed') });
    await expect(inspectImage({}, {}, { processWorker: true })).resolves.toBe('ERROR: spawn failed');
    mockWorker({ stderr: 'worker failed', code: 2 });
    await expect(inspectImage({}, {}, { processWorker: true })).resolves.toBe('ERROR: worker failed');
    mockWorker({ code: 3 });
    await expect(inspectImage({}, {}, { processWorker: true })).resolves.toBe('ERROR: image worker exited with code 3');
    const usage = [];
    mockWorker({ stdout: JSON.stringify({ error: 'partial failure', usage: { turns: 2, inputTokens: 11, outputTokens: 5 } }), code: 7 });
    await expect(inspectImage({}, {}, { processWorker: true, onUsage: value => usage.push(value) })).resolves.toBe('ERROR: partial failure');
    expect(usage).toEqual([{ turns: 2, inputTokens: 11, outputTokens: 5 }]);
    mockWorker({ stdout: '{bad' });
    await expect(inspectImage({}, {}, { processWorker: true })).resolves.toBe('ERROR: invalid image worker response');
    mockWorker({ stdout: '{bad', stderr: 'parse detail' });
    await expect(inspectImage({}, {}, { processWorker: true })).resolves.toBe('ERROR: invalid image worker response: parse detail');
  });

  test('handles worker fallback fields and omitted options', async () => {
    mockWorker({ stdout: JSON.stringify({}) });
    await expect(inspectImage({}, {}, { processWorker: true })).resolves.toBe('The image inspection returned no text.');
    mockWorker({ stdout: JSON.stringify({ text: '', error: 'worker detail' }) });
    await expect(inspectImage({}, {}, { processWorker: true })).resolves.toBe('worker detail');
    mockWorker({ stdout: JSON.stringify({ text: '' }) });
    await expect(inspectImage({}, {}, { processWorker: true })).resolves.toBe('The image inspection returned no text.');
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,x', detail: 'low' });
    await expect(inspectImage({ responses: { create: jest.fn().mockResolvedValue({}) } }, { prompt: 'x', images: [{ path: 'x' }] })).resolves.toBe('The image inspection returned no text.');
    await expect(runImageInspection({ responses: { create: jest.fn().mockResolvedValue({}) } }, { prompt: 'x', images: [{ path: 'x' }] })).resolves.toBe('The image inspection returned no text.');
  });

  test('requires an instruction', async () => {
    const openai = { responses: { create: jest.fn() } };
    await expect(inspectImage(openai, undefined, { cwd: '/work', responseId: 'resp', model: 'model' }))
      .resolves.toBe('ERROR: image prompt is required');
    expect(encodeImageInput).not.toHaveBeenCalled();
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  test('inspects an image in an isolated response', async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,abc', detail: 'high' });
    extractTextFromResponse.mockReturnValue('A cat.');
    const create = jest.fn().mockResolvedValue({ id: 'child', usage: { input_tokens: 12, input_tokens_details: { cached_tokens: 2 }, output_tokens: 4 } });
    const usage = [];
    const openai = { responses: { create } };

    await expect(inspectImage(openai, { images: [{ path: 'cat.png', caption: 'A pet' }], prompt: 'Describe it', detail: 'high' }, {
      cwd: '/work', responseId: 'tool-call', previousResponseId: 'parent', callerResponse: { id: 'tool-call' }, model: 'gpt-test', onUsage: (value) => usage.push(value),
    })).resolves.toBe('A cat.');

    expect(encodeImageInput).toHaveBeenCalledWith('cat.png', { cwd: '/work', detail: 'high' });
    expect(usage).toEqual([{ inputTokens: 10, cachedTokens: 2, outputTokens: 4 }]);
    expect(create).toHaveBeenCalledWith({
      model: 'gpt-test',
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'Describe it' },
        { type: 'input_text', text: 'A pet' },
        { type: 'input_image', image_url: 'data:image/jpeg;base64,abc', detail: 'high' },
      ] }],
      previous_response_id: 'parent',
      store: true,
      tools: [{ type: 'shell', environment: { type: 'local' } }, { type: 'image_generation' }],
    });
  });

  test('allows branch shell calls and submits their output', async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,abc', detail: 'low' });
    extractTextFromResponse.mockReturnValue('Shell result.');
    const create = jest.fn()
      .mockResolvedValueOnce({ id: 'shell-call', output: [{ type: 'shell_call', call_id: 'shell-1', action: { commands: ['printf branch'] } }] })
      .mockResolvedValueOnce({ id: 'shell-final', output: [] });
    const openai = { responses: { create } };

    await expect(inspectImage(openai, { images: [{ path: 'x' }], prompt: 'Inspect' }, {
      cwd: process.cwd(), responseId: 'parent', model: 'model',
    })).resolves.toBe('Shell result.');
    expect(create.mock.calls[1][0].input[0]).toMatchObject({
      type: 'shell_call_output', call_id: 'shell-1',
    });
    expect(create.mock.calls[1][0].input[0].output[0].stdout).toBe('branch');
  });

  test('returns generated image paths from the branch', async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,x', detail: 'low' });
    extractTextFromResponse.mockReturnValue('Generated.');
    saveGeneratedImage.mockResolvedValue('/tmp/generated.png');
    const openai = { responses: { create: jest.fn().mockResolvedValue({
      id: 'generated',
      output: [{ type: 'image_generation_call', result: 'base64-image' }],
    }) } };

    await expect(inspectImage(openai, { images: [{ path: 'x' }], prompt: 'Generate' }, {
      cwd: '/tmp', responseId: 'parent', model: 'model',
    })).resolves.toBe('Generated.\n\nGenerated image path(s): /tmp/generated.png');
    expect(saveGeneratedImage).toHaveBeenCalledWith({ type: 'image_generation_call', result: 'base64-image' });
  });

  test('falls back to the supplied response ID when the caller response has no predecessor', async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,xyz', detail: 'low' });
    extractTextFromResponse.mockReturnValue('A diagram.');
    const create = jest.fn().mockResolvedValue({ id: 'child' });
    const openai = { responses: { create } };

    await inspectImage(openai, { images: [{ path: 'x' }], prompt: 'Inspect' }, {
      cwd: '/tmp', responseId: 'parent', callerResponse: { id: 'tool-call' }, model: 'model',
    });

    expect(create.mock.calls[0][0].previous_response_id).toBe('parent');
  });

  test('uses low detail and fallback text', async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,xyz', detail: 'low' });
    extractTextFromResponse.mockReturnValue('');
    const openai = { responses: { create: jest.fn().mockResolvedValue({}) } };

    await expect(inspectImage({ ...openai }, { images: [{ path: 'x' }], prompt: 'What is this?' }, {
      cwd: '/tmp', responseId: null, model: 'model',
    })).resolves.toBe('The image inspection returned no text.');
    expect(encodeImageInput).toHaveBeenCalledWith('x', { cwd: '/tmp', detail: 'low' });
  });

  test('defaults to low detail and rejects invalid request sizes', async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,x', detail: 'low' });
    const create = jest.fn().mockResolvedValue({});
    await expect(inspectImage({ responses: { create } }, { images: [{ path: 'x' }], prompt: 'Inspect' }, {})).resolves.toBe('The image inspection returned no text.');
    expect(encodeImageInput).toHaveBeenCalledWith('x', { cwd: undefined, detail: 'low' });
    await expect(inspectImage({}, { prompt: 'x' }, {})).resolves.toBe('ERROR: at least one image is required');
    await expect(inspectImage({}, { images: [], prompt: 'x' }, {})).resolves.toBe('ERROR: at least one image is required');
    await expect(inspectImage({}, { images: Array.from({ length: 11 }, () => ({ path: 'x' })), prompt: 'x' }, {})).resolves.toContain('maximum of 10');
    await expect(inspectImage({}, { images: [{ path: 'x' }], prompt: 'x'.repeat(10001) }, {})).resolves.toContain('10000');
  });

  test('returns errors from image inspection', async () => {
    encodeImageInput.mockRejectedValueOnce(new Error('cannot read'));
    await expect(inspectImage({}, { images: [{ path: 'x' }], prompt: 'inspect' }, {})).resolves.toBe('ERROR: cannot read');

    encodeImageInput.mockRejectedValueOnce('bad');
    await expect(inspectImage({}, { images: [{ path: 'x' }], prompt: 'inspect' }, {})).resolves.toBe('ERROR: bad');
  });
});
