import { writeTerminal } from "../terminal-output.mjs";
import { formatSystemMessage } from "../shell-display.mjs";
import { isMcpToolCall, isShellToolCall } from "./response-event-types.mjs";
import { responseItemToTranscript } from "./response-format.mjs";

export function createResponseItemDoneHandler({
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
  appendStreamedText,
}) {
  return function onItemDone(item) {
    if (item?.type === "web_search_call") {
      if (!noWebsearch) webSearchRenderer.finish(item);
      return;
    }
    const customCall = item?.type === "function_call" || item?.type === "custom_call";
    if ((isMcpToolCall(item) && noMcpOutput) || (isShellToolCall(item) && noShellCalls)) return;
    if (customCall && noToolCalls) return;
    if (isShellToolCall(item) || isMcpToolCall(item) || customCall) {
      markOutput();
      appendStreamedText(
        isMcpToolCall(item) ? mcpRenderer.finishCall() : toolEventRenderer.finishItem(),
      );
    }
    if (item?.type !== "reasoning" || noReasoning || debug) return;
    const transcript = responseItemToTranscript(item);
    if (transcript && !reasoningRenderer.hasStreamedSummary())
      writeTerminal(formatSystemMessage(transcript) + "\n");
  };
}
