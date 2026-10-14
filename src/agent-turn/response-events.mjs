import { createResponseTextRenderer } from "./response-text-renderer.mjs";
import { createReasoningSummaryRenderer } from "./reasoning-summary-renderer.mjs";
import { createWebSearchRenderer } from "./web-search-renderer.mjs";
import { createMcpEventRenderer } from "./mcp-event-renderer.mjs";
import { createToolEventRenderer } from "./tool-event-renderer.mjs";
import { createResponseItemDoneHandler } from "./response-item-done.mjs";
import { createResponseEventHandler } from "./response-event-handler.mjs";

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
  const { writeTextDelta, flushTextDelta } = createResponseTextRenderer();
  const reasoningRenderer = createReasoningSummaryRenderer(statusController);
  const webSearchRenderer = createWebSearchRenderer(statusController);
  const toolEventRenderer = createToolEventRenderer();
  const markOutput = () => {
    if (sawOutput) return;
    sawOutput = true;
    statusController?.beginWriting();
  };
  const mcpRenderer = createMcpEventRenderer({ statusController, markOutput });
  const onEvent = createResponseEventHandler({
    noReasoning,
    noShellCalls,
    noToolCalls,
    noMcpOutput,
    noWebsearch,
    debug,
    reasoningRenderer,
    webSearchRenderer,
    mcpRenderer,
    toolEventRenderer,
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
    webSearchRenderer,
    reasoningRenderer,
    mcpRenderer,
    toolEventRenderer,
    markOutput,
    appendStreamedText: (text) => {
      streamedText += text;
    },
  });

  return {
    flushTextDelta,
    sawOutput: () => sawOutput,
    streamedText: () => streamedText,
    handlers: liveStreaming
      ? {
          onEvent,
          onItemAdded(item) {
            if (item?.type === "mcp_call" && !noMcpOutput) mcpRenderer.addCall(item);
          },
          onTextDelta(delta) {
            markOutput();
            const text = String(delta ?? "");
            streamedText += text;
            writeTextDelta(text);
          },
          onItemDone,
        }
      : null,
  };
}
