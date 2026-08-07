import { applyFirstUserMessage, buildInputMessage } from '../prompt-builder.mjs';
import { runToolCall } from '../tool-dispatch.mjs';
import { createStatusLineController } from './status-controller.mjs';
import { handleToolCalls } from './tool-loop.mjs';
import { createStreamedResponse } from './response-stream.mjs';

export async function sendMessage(openai, template, previousResponseId, userMessage, agentsText, cwd, onResponseUsage, requestOverride = null, streamOptions = {}) {
  const baseRequest = JSON.parse(JSON.stringify(template));
  const sessionStartedAt = streamOptions?.sessionStartedAt ?? Date.now();
  const statusController = streamOptions?.statusController || createStatusLineController(sessionStartedAt, { quiet: Boolean(streamOptions?.suppressStatusOutput), transitionOnly: Boolean(streamOptions?.transitionOnlyStatus) });
  const request = requestOverride ? { ...baseRequest, ...requestOverride } : (previousResponseId
    ? {
      ...baseRequest,
      input: [buildInputMessage(userMessage)],
      store: true,
      previous_response_id: previousResponseId,
    }
    : {
      ...applyFirstUserMessage(baseRequest, userMessage, agentsText, cwd),
      store: true,
    });

  try {
    const response = await createStreamedResponse(openai, request, { liveStreaming: Boolean(streamOptions?.liveStreaming), statusController, debug: Boolean(streamOptions?.debug) });
    return await handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCall, { ...streamOptions, statusController });
  } catch (error) {
    statusController?.stop?.();
    throw error;
  }
}
