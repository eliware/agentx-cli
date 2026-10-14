import { createLiveResponseHandlers } from "./response-events.mjs";
import { finalizeStreamOutput } from "./response-stream-finalization.mjs";
import { createResponseStreamHandlers } from "./response-stream-handler-policy.mjs";

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
  const handlers = createResponseStreamHandlers(live, debug);
  try {
    const response = await openai.responses.create(request, handlers);
    if (liveStreaming) finalizeStreamOutput(live, colors);
    return response;
  } finally {
    statusController?.clear();
  }
}
