import { describe, expect, jest, test, beforeEach } from '@jest/globals';

const encodeImageInput = jest.fn();
const extractTextFromResponse = jest.fn();

await jest.unstable_mockModule('../src/image-input.mjs', () => ({ encodeImageInput }));
await jest.unstable_mockModule('../src/response.mjs', () => ({ extractTextFromResponse }));

const { inspectImage } = await import('../src/image-inspector.mjs');

describe('image inspection', () => {
  beforeEach(() => {
    encodeImageInput.mockReset();
    extractTextFromResponse.mockReset();
  });

  test('requires an instruction', async () => {
    const openai = { responses: { create: jest.fn() } };
    await expect(inspectImage(openai, undefined, { cwd: '/work', responseId: 'resp', model: 'model' }))
      .resolves.toBe('ERROR: image instruction is required');
    expect(encodeImageInput).not.toHaveBeenCalled();
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  test('inspects an image in an isolated response', async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,abc', detail: 'high' });
    extractTextFromResponse.mockReturnValue('A cat.');
    const create = jest.fn().mockResolvedValue({ id: 'child' });
    const openai = { responses: { create } };

    await expect(inspectImage(openai, { path: 'cat.png', instruction: 'Describe it', detail: 'high' }, {
      cwd: '/work', responseId: 'parent', model: 'gpt-test',
    })).resolves.toBe('A cat.');

    expect(encodeImageInput).toHaveBeenCalledWith('cat.png', { cwd: '/work', detail: 'high' });
    expect(create).toHaveBeenCalledWith({
      model: 'gpt-test',
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'Describe it' },
        { type: 'input_image', image_url: 'data:image/jpeg;base64,abc', detail: 'high' },
      ] }],
      previous_response_id: 'parent',
      store: true,
      tools: [],
    });
  });

  test('uses automatic detail and fallback text', async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,xyz', detail: 'auto' });
    extractTextFromResponse.mockReturnValue('');
    const openai = { responses: { create: jest.fn().mockResolvedValue({}) } };

    await expect(inspectImage({ ...openai }, { path: 'x', instruction: 'What is this?' }, {
      cwd: '/tmp', responseId: null, model: 'model',
    })).resolves.toBe('The image inspection returned no text.');
    expect(encodeImageInput).toHaveBeenCalledWith('x', { cwd: '/tmp', detail: 'auto' });
  });

  test('returns errors from image inspection', async () => {
    encodeImageInput.mockRejectedValueOnce(new Error('cannot read'));
    await expect(inspectImage({}, { path: 'x', instruction: 'inspect' }, {})).resolves.toBe('ERROR: cannot read');

    encodeImageInput.mockRejectedValueOnce('bad');
    await expect(inspectImage({}, { path: 'x', instruction: 'inspect' }, {})).resolves.toBe('ERROR: bad');
  });
});
