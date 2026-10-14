import { buildResponseRequest } from "../request-builder.mjs";
import { runToolCall } from "../tool-dispatch.mjs";
import { handleToolCalls } from "./tool-loop.mjs";
import { createResponseStreamContext, submitResponseStream } from "./response-stream-request.mjs";

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
  const context = createResponseStreamContext(streamOptions);
  const { statusController } = context;
  const request = buildResponseRequest(
    baseRequest,
    userMessage,
    agentsText,
    cwd,
    previousResponseId,
    requestOverride,
  );

  try {
    const response = await submitResponseStream(openai, request, context, streamOptions);
    return await handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCall, {
      ...streamOptions,
      statusController,
    });
  } catch (error) {
    statusController?.stop?.();
    throw error;
  }
}
