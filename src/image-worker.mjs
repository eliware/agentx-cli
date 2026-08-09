import { createOpenAI } from '@eliware/openai';
import { runImageInspection } from './image-inspector.mjs';

const request = JSON.parse(process.env.AGENTX_IMAGE_REQUEST || '{}');
const apiKey = process.env.agentx_api_key || process.env.AGENTX_API_KEY;
const needsNoClient = !String(request.args?.prompt ?? '').trim() || !Array.isArray(request.args?.images) || request.args.images.length === 0 || request.args.images.length > 10 || String(request.args?.prompt ?? '').length > 10_000;
const openai = needsNoClient ? null : createOpenAI({ apiKey, transport: 'websocket' });
const usage = { turns: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
try {
  const text = await runImageInspection(openai, request.args, { ...request, onUsage: (value) => {
    usage.turns += value?.turns || 1;
    usage.inputTokens += value?.inputTokens || 0;
    usage.cachedTokens += value?.cachedTokens || 0;
    usage.outputTokens += value?.outputTokens || 0;
  } });
  process.stdout.write(JSON.stringify({ text, usage }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: `ERROR: ${error?.message || String(error)}`, usage }));
} finally {
  try { await openai?.responses?.close?.(); } catch { /* best effort */ }
}
