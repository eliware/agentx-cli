import { buildResponseRequest } from "../request-builder.mjs";
import { runToolCall } from "../tool-dispatch.mjs";
import { createStatusLineController } from "./status-controller.mjs";
import { handleToolCalls } from "./tool-loop.mjs";
import { createStreamedResponse } from "./response-stream.mjs";

export async function sendMessage(
  openai,
  template,
  previousResponseId,
  userMessage,
  agentsText,
  cwd,
  onResponseUsage,
  requestOverride = null,
  streamOptions = {},
) {
  const baseRequest = JSON.parse(JSON.stringify(template));
  const sessionStartedAt = streamOptions?.sessionStartedAt ?? Date.now();
  const statusController =
    streamOptions?.statusController ||
    createStatusLineController(sessionStartedAt, {
      quiet: Boolean(streamOptions?.suppressStatusOutput || streamOptions?.noTimers),
      transitionOnly: Boolean(streamOptions?.transitionOnlyStatus),
      colors: streamOptions?.colors !== false,
    });
  const request = buildResponseRequest(
    baseRequest,
    userMessage,
    agentsText,
    cwd,
    previousResponseId,
    requestOverride,
  );

  try {
    const response = await createStreamedResponse(openai, request, {
      liveStreaming: Boolean(streamOptions?.liveStreaming),
      statusController,
      debug: Boolean(streamOptions?.debug),
      colors: streamOptions?.colors !== false,
      noReasoning: Boolean(streamOptions?.noReasoning),
      noShellCalls: Boolean(streamOptions?.noShellCalls),
      noToolCalls: Boolean(streamOptions?.noToolCalls),
      noMcpOutput: Boolean(streamOptions?.noMcpOutput),
      noWebsearch: Boolean(streamOptions?.noWebsearch),
    });
    return await handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCall, {
      ...streamOptions,
      statusController,
    });
  } catch (error) {
    statusController?.stop?.();
    throw error;
  }
}
