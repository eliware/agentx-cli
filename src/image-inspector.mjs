import { encodeImageInput } from './image-input.mjs';
import { extractTextFromResponse } from './response.mjs';
import { saveGeneratedImage } from './image-generation.mjs';

const MAX_IMAGES = 10;
const MAX_PROMPT_LENGTH = 10_000;

export async function inspectImage(openai, args, { cwd, responseId, callerResponse, model }) {
  const prompt = String(args?.prompt ?? '').trim();
  if (!prompt) return 'ERROR: image prompt is required';
  if (prompt.length > MAX_PROMPT_LENGTH) return `ERROR: image prompt exceeds the ${MAX_PROMPT_LENGTH} character limit`;
  const images = Array.isArray(args?.images) ? args.images : [];
  if (!images.length) return 'ERROR: at least one image is required';
  if (images.length > MAX_IMAGES) return `ERROR: a maximum of ${MAX_IMAGES} images is allowed`;
  try {
    const detail = args?.detail || 'low';
    const content = [{ type: 'input_text', text: prompt }];
    for (const item of images) {
      const image = await encodeImageInput(item?.path, { cwd, detail });
      if (item?.caption) content.push({ type: 'input_text', text: String(item.caption) });
      content.push({ type: 'input_image', image_url: image.dataUrl, detail: image.detail });
    }
    const response = await openai.responses.create({
      model,
      input: [{ role: 'user', content }],
      previous_response_id: callerResponse?.previous_response_id || responseId,
      store: true,
      tools: [{ type: 'shell', environment: { type: 'local' } }, { type: 'image_generation' }],
    });
    const { runToolCall, toolOutputForCall } = await import('./tool-dispatch.mjs');
    let completed = response;
    const generatedPaths = [];
    for (let turn = 0; turn < 10; turn += 1) {
      for (const item of completed?.output || []) {
        if (item?.type === 'image_generation_call' && item?.result) generatedPaths.push(await saveGeneratedImage(item));
      }
      const calls = (completed?.output || []).filter((item) => item?.type === 'shell_call');
      if (!calls.length) break;
      const outputs = [];
      for (const call of calls) outputs.push(toolOutputForCall(call, await runToolCall(call, cwd)));
      completed = await openai.responses.create({
        model,
        input: outputs,
        previous_response_id: completed.id,
        store: true,
        tools: [{ type: 'shell', environment: { type: 'local' } }, { type: 'image_generation' }],
      });
    }
    const text = extractTextFromResponse(completed);
    const generated = generatedPaths.length ? `Generated image path(s): ${generatedPaths.join(', ')}` : '';
    return [text, generated].filter(Boolean).join('\n\n') || 'The image inspection returned no text.';
  } catch (error) {
    return `ERROR: ${error?.message || String(error)}`;
  }
}

export { MAX_IMAGES, MAX_PROMPT_LENGTH };
