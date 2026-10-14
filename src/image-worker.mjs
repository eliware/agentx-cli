import { createOpenAI } from "@eliware/openai";
import { runImageInspection } from "./image-inspector.mjs";
import { isValidImageWorkerRequest, resolveImageWorkerApiKey } from "./image-worker-config.mjs";
import { createImageWorkerUsage } from "./image-worker-usage.mjs";

const request = JSON.parse(process.env.AGENTX_IMAGE_REQUEST || "{}");
const apiKey = resolveImageWorkerApiKey(process.env);
const needsNoClient = !isValidImageWorkerRequest(request.args);
const openai = needsNoClient ? null : createOpenAI({ apiKey, transport: "websocket" });
const usage = createImageWorkerUsage();
try {
  const text = await runImageInspection(openai, request.args, {
    ...request,
    onUsage: (value) => usage.add(value),
  });
  process.stdout.write(JSON.stringify({ text, usage: usage.usage }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: `ERROR: ${error?.message || String(error)}`, usage: usage.usage }),
  );
} finally {
  try {
    await openai?.responses?.close?.();
  } catch {
    /* best effort */
  }
}
