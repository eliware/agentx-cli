import { createStatusLineController } from "./status-controller.mjs";
import { createStreamedResponse } from "./response-stream.mjs";

export function createResponseStreamContext(streamOptions = {}) {
  const sessionStartedAt = streamOptions?.sessionStartedAt ?? Date.now();
  const statusController =
    streamOptions?.statusController ||
    createStatusLineController(sessionStartedAt, {
      quiet: Boolean(streamOptions?.suppressStatusOutput || streamOptions?.noTimers),
      transitionOnly: Boolean(streamOptions?.transitionOnlyStatus),
      colors: streamOptions?.colors !== false,
    });
  return { sessionStartedAt, statusController };
}

export function submitResponseStream(openai, request, context, streamOptions = {}) {
  return createStreamedResponse(openai, request, {
    liveStreaming: Boolean(streamOptions?.liveStreaming),
    statusController: context.statusController,
    debug: Boolean(streamOptions?.debug),
    colors: streamOptions?.colors !== false,
    noReasoning: Boolean(streamOptions?.noReasoning),
    noShellCalls: Boolean(streamOptions?.noShellCalls),
    noToolCalls: Boolean(streamOptions?.noToolCalls),
    noMcpOutput: Boolean(streamOptions?.noMcpOutput),
    noWebsearch: Boolean(streamOptions?.noWebsearch),
  });
}
