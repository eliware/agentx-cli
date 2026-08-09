import { describe, expect, jest, test, beforeEach } from '@jest/globals';

const encodeImageInput = jest.fn();
const extractTextFromResponse = jest.fn();
const saveGeneratedImage = jest.fn();

await jest.unstable_mockModule('../src/image-input.mjs', () => ({ encodeImageInput }));
await jest.unstable_mockModule('../src/response.mjs', () => ({ extractTextFromResponse }));
await jest.unstable_mockModule('../src/image-generation.mjs', () => ({ saveGeneratedImage }));

const { inspectImage } = await import('../src/image-inspector.mjs');

describe('image inspection', () => {
  beforeEach(() => {
    encodeImageInput.mockReset();
    extractTextFromResponse.mockReset();
    saveGeneratedImage.mockReset();
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
    const create = jest.fn().mockResolvedValue({ id: 'child' });
    const openai = { responses: { create } };

    await expect(inspectImage(openai, { images: [{ path: 'cat.png', caption: 'A pet' }], prompt: 'Describe it', detail: 'high' }, {
      cwd: '/work', responseId: 'tool-call', previousResponseId: 'parent', callerResponse: { id: 'tool-call' }, model: 'gpt-test',
    })).resolves.toBe('A cat.');

    expect(encodeImageInput).toHaveBeenCalledWith('cat.png', { cwd: '/work', detail: 'high' });
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
