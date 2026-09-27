import { createOpenAI } from "@eliware/openai";
import { runImageInspection } from "./image-inspector.mjs";
import { isValidImageWorkerRequest, resolveImageWorkerApiKey } from "./image-worker-config.mjs";

const request = JSON.parse(process.env.AGENTX_IMAGE_REQUEST || "{}");
const apiKey = resolveImageWorkerApiKey(process.env);
const needsNoClient = !isValidImageWorkerRequest(request.args);
const openai = needsNoClient ? null : createOpenAI({ apiKey, transport: "websocket" });
const usage = { turns: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
try {
  const text = await runImageInspection(openai, request.args, {
    ...request,
    onUsage: (value) => {
      usage.turns += value?.turns || 1;
      usage.inputTokens += value?.inputTokens || 0;
      usage.cachedTokens += value?.cachedTokens || 0;
      usage.outputTokens += value?.outputTokens || 0;
    },
  });
  process.stdout.write(JSON.stringify({ text, usage }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: `ERROR: ${error?.message || String(error)}`, usage }),
  );
} finally {
  try {
    await openai?.responses?.close?.();
  } catch {
    /* best effort */
  }
}
