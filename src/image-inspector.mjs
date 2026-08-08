import { encodeImageInput } from './image-input.mjs';
import { extractTextFromResponse } from './response.mjs';

export async function inspectImage(openai, args, { cwd, responseId, callerResponse, model }) {
  const instruction = String(args?.instruction ?? '').trim();
  if (!instruction) return 'ERROR: image instruction is required';
  try {
    const image = await encodeImageInput(args?.path, { cwd, detail: args?.detail || 'auto' });
    const response = await openai.responses.create({
      model,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: instruction },
        { type: 'input_image', image_url: image.dataUrl, detail: image.detail },
      ] }],
      previous_response_id: callerResponse?.previous_response_id || responseId,
      store: true,
      tools: [],
    });
    return extractTextFromResponse(response) || 'The image inspection returned no text.';
  } catch (error) {
    return `ERROR: ${error?.message || String(error)}`;
  }
}
