import { spawn } from 'node:child_process';
import { path } from '@eliware/common';
import { encodeImageInput } from './image-input.mjs';
import { extractTextFromResponse, extractUsage } from './response.mjs';
import { saveGeneratedImage } from './image-generation.mjs';

const MAX_IMAGES = 10;
const MAX_PROMPT_LENGTH = 10_000;
const imageBranchQueues = new Map();

export async function inspectImage(openai, args, options = {}) {
  if (options.processWorker) return await runImageInspectionProcess(args, options);
  return await runImageInspection(openai, args, options);
}

async function runImageInspectionProcess(args, options) {
  const key = `${options?.cwd || ''}:${options?.previousResponseId || options?.responseId || ''}`;
  const prior = imageBranchQueues.get(key) || Promise.resolve();
  const current = prior.catch(() => {}).then(() => runQueuedImageInspectionProcess(args, options));
  const tracked = current.finally(() => {
    if (imageBranchQueues.get(key) === tracked) imageBranchQueues.delete(key);
  });
  imageBranchQueues.set(key, tracked);
  return current;
}

async function runQueuedImageInspectionProcess(args, { cwd, responseId, previousResponseId, model, onUsage }) {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [path(import.meta, './image-worker.mjs')], {
      cwd,
      env: { ...process.env, AGENTX_IMAGE_REQUEST: JSON.stringify({ args, cwd, responseId, previousResponseId, model }) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => resolve(`ERROR: ${error.message}`));
    child.on('close', (code) => {
      if (code !== 0) { resolve(`ERROR: ${stderr.trim() || `image worker exited with code ${code}`}`); return; }
      try {
        const result = JSON.parse(stdout);
        if (result.usage) onUsage?.(result.usage);
        resolve(result.text || result.error || 'The image inspection returned no text.');
      } catch { resolve(`ERROR: invalid image worker response${stderr.trim() ? `: ${stderr.trim()}` : ''}`); }
    });
  });
}

export async function runImageInspection(openai, args, { cwd, responseId, previousResponseId, callerResponse, model, onUsage } = {}) {
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
      ...(previousResponseId || callerResponse?.previous_response_id || responseId ? { previous_response_id: previousResponseId || callerResponse?.previous_response_id || responseId } : {}),
      store: true,
      tools: [{ type: 'shell', environment: { type: 'local' } }, { type: 'image_generation' }],
    });
    const { runToolCall, toolOutputForCall } = await import('./tool-dispatch.mjs');
    let completed = response;
    onUsage?.(extractUsage(completed));
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
      onUsage?.(extractUsage(completed));
    }
    const text = extractTextFromResponse(completed);
    const generated = generatedPaths.length ? `Generated image path(s): ${generatedPaths.join(', ')}` : '';
    return [text, generated].filter(Boolean).join('\n\n') || 'The image inspection returned no text.';
  } catch (error) {
    return `ERROR: ${error?.message || String(error)}`;
  }
}

export { MAX_IMAGES, MAX_PROMPT_LENGTH };
