import { createOpenAI } from "@eliware/openai";
import { runImageInspection } from "./image-inspector.mjs";
import { isValidImageWorkerRequest, resolveImageWorkerApiKey } from "./image-worker-config.mjs";
import { createImageWorkerUsage } from "./image-worker-usage.mjs";

export async function runImageWorker(
  request,
  { environment = process.env, createClient = createOpenAI, inspect = runImageInspection } = {},
) {
  const apiKey = resolveImageWorkerApiKey(environment);
  const openai = isValidImageWorkerRequest(request.args)
    ? createClient({ apiKey, transport: "websocket" })
    : null;
  const usage = createImageWorkerUsage();
  try {
    const text = await inspect(openai, request.args, {
      ...request,
      onUsage: (value) => usage.add(value),
    });
    return { text, usage: usage.usage };
  } catch (error) {
    return { error: `ERROR: ${error?.message || String(error)}`, usage: usage.usage };
  } finally {
    try {
      await openai?.responses?.close?.();
    } catch {}
  }
}
