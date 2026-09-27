import { createOpenAI } from "@eliware/openai";

const DEBUG_EVENTS = ["connecting", "open", "reconnecting", "reconnected", "close"];

export function resolveAgentApiKey(env = process.env) {
  const apiKey = String(env.agentx_api_key || env.AGENTX_API_KEY || "").trim();
  if (apiKey) return apiKey;
  throw new Error("Set agentx_api_key or AGENTX_API_KEY in your shell environment.");
}

export function bindAgentDebugListeners(client, stderr = process.stderr) {
  if (typeof client?.responses?.on !== "function") return false;
  for (const event of DEBUG_EVENTS) {
    client.responses.on(event, (detail) =>
      stderr.write(`[openai:${event}] ${JSON.stringify(detail ?? {})}\n`),
    );
  }
  return true;
}

export function createAgentClient({
  apiKey,
  isDebugEnabled = () => false,
  clientFactory = createOpenAI,
  stderr = process.stderr,
} = {}) {
  const client = clientFactory({ apiKey, transport: "websocket" });
  if (typeof client?.responses?.on === "function") {
    // Always bind error: the SDK otherwise reports transport errors as
    // process-level unhandled rejections.
    client.responses.on("error", (detail) => {
      if (isDebugEnabled()) stderr.write(`[openai:error] ${JSON.stringify(detail ?? {})}\n`);
    });
    if (isDebugEnabled()) bindAgentDebugListeners(client, stderr);
  }
  return client;
}
