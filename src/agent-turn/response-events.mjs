import { createResponseItemDoneHandler } from "./response-item-done.mjs";
import { createResponseEventHandler } from "./response-event-handler.mjs";
import { createResponseRenderers } from "./response-renderers.mjs";
import { createResponseStreamState } from "./response-stream-state.mjs";
import { createResponseTextDeltaHandler } from "./response-text-delta-handler.mjs";

export function createLiveResponseHandlers({
  liveStreaming,
  statusController,
  debug = false,
  noReasoning = false,
  noShellCalls = false,
  noToolCalls = false,
  noMcpOutput = false,
  noWebsearch = false,
}) {
  const streamState = createResponseStreamState(statusController);
  const renderers = createResponseRenderers({
    statusController,
    markOutput: streamState.markOutput,
  });
  const onEvent = createResponseEventHandler({
    noReasoning,
    noShellCalls,
    noToolCalls,
    noMcpOutput,
    noWebsearch,
    debug,
    reasoningRenderer: renderers.reasoning,
    webSearchRenderer: renderers.webSearch,
    mcpRenderer: renderers.mcp,
    toolEventRenderer: renderers.tool,
    markOutput: streamState.markOutput,
    appendStreamedText: streamState.appendStreamedText,
  });
  const onItemDone = createResponseItemDoneHandler({
    noReasoning,
    noShellCalls,
    noToolCalls,
    noMcpOutput,
    noWebsearch,
    debug,
    webSearchRenderer: renderers.webSearch,
    reasoningRenderer: renderers.reasoning,
    mcpRenderer: renderers.mcp,
    toolEventRenderer: renderers.tool,
    markOutput: streamState.markOutput,
    appendStreamedText: streamState.appendStreamedText,
  });
  const onTextDelta = createResponseTextDeltaHandler({
    streamState,
    textRenderer: renderers.text,
  });

  return {
    flushTextDelta: renderers.text.flushTextDelta,
    sawOutput: streamState.sawOutput,
    streamedText: streamState.streamedText,
    handlers: liveStreaming
      ? {
          onEvent,
          onItemAdded(item) {
            if (item?.type === "mcp_call" && !noMcpOutput) renderers.mcp.addCall(item);
          },
          onTextDelta,
          onItemDone,
        }
      : null,
  };
}
