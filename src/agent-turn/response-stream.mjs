import { createLiveResponseHandlers } from "./response-events.mjs";
import { createDebugEventHandler } from "./response-debug-events.mjs";
import { finalizeStreamOutput } from "./response-stream-finalization.mjs";

export async function createStreamedResponse(
  openai,
  request,
  {
    liveStreaming = false,
    statusController = null,
    debug = false,
    colors = true,
    noReasoning = false,
    noShellCalls = false,
    noToolCalls = false,
    noMcpOutput = false,
    noWebsearch = false,
  } = {},
) {
  if (liveStreaming) statusController?.showReasoning();
  const live = createLiveResponseHandlers({
    liveStreaming,
    statusController,
    colors,
    noReasoning,
    noShellCalls,
    noToolCalls,
    noMcpOutput,
    noWebsearch,
    ...(debug ? { debug: true } : {}),
  });
  const handlers = live.handlers ? { ...live.handlers } : debug ? {} : undefined;
  if (debug) handlers.onEvent = createDebugEventHandler();
  try {
    const response = await openai.responses.create(request, handlers);
    if (liveStreaming) finalizeStreamOutput(live, colors);
    return response;
  } finally {
    statusController?.clear();
  }
}
