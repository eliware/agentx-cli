import { createResponseItemDoneHandler } from "./response-item-done.mjs";
import { createResponseEventHandler } from "./response-event-handler.mjs";
import { createResponseRenderers } from "./response-renderers.mjs";

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
  let sawOutput = false;
  let streamedText = "";
  const markOutput = () => {
    if (sawOutput) return;
    sawOutput = true;
    statusController?.beginWriting();
  };
  const renderers = createResponseRenderers({ statusController, markOutput });
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
    markOutput,
    appendStreamedText: (text) => {
      streamedText += text;
    },
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
    markOutput,
    appendStreamedText: (text) => {
      streamedText += text;
    },
  });

  return {
    flushTextDelta: renderers.text.flushTextDelta,
    sawOutput: () => sawOutput,
    streamedText: () => streamedText,
    handlers: liveStreaming
      ? {
          onEvent,
          onItemAdded(item) {
            if (item?.type === "mcp_call" && !noMcpOutput) renderers.mcp.addCall(item);
          },
          onTextDelta(delta) {
            markOutput();
            const text = String(delta ?? "");
            streamedText += text;
            renderers.text.writeTextDelta(text);
          },
          onItemDone,
        }
      : null,
  };
}
