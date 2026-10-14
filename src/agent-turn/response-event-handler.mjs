import {
  isFunctionCallArgumentsDeltaEvent,
  isMcpEvent,
  isReasoningSummaryEvent,
  isResponseCompletedEvent,
  isShellCallCommandDeltaEvent,
  isWebSearchEvent,
} from "./response-event-types.mjs";

export function createResponseEventHandler({
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
  appendStreamedText,
}) {
  return function onEvent(event, message) {
    if (isResponseCompletedEvent(event, message?.raw)) return;
    if (isReasoningSummaryEvent(event)) {
      if (noReasoning || debug) return;
      if (event.type.endsWith(".delta"))
        reasoningRenderer.writeDelta(event?.delta ?? event?.text ?? event?.summary_text);
      else if (event.type.endsWith(".done")) reasoningRenderer.finish();
      return;
    }
    if (isMcpEvent(event)) {
      if (noMcpOutput || (debug && event.type === "response.mcp_call_arguments.delta")) return;
      if (event.type === "response.mcp_call_arguments.delta") mcpRenderer.writeArguments(event);
      else mcpRenderer.handleEvent(event);
      return;
    }
    if (isWebSearchEvent(event)) {
      if (noWebsearch) return;
      if (event.type.endsWith(".in_progress")) webSearchRenderer.start();
      else if (event.type.endsWith(".searching")) webSearchRenderer.searching();
      return;
    }
    const shellDelta = isShellCallCommandDeltaEvent(event);
    if (!isFunctionCallArgumentsDeltaEvent(event) && !shellDelta) return;
    if (shellDelta ? noShellCalls : noToolCalls) return;
    markOutput();
    const delta = String(event?.delta ?? "");
    if (delta) appendStreamedText(toolEventRenderer.writeDelta(event));
  };
}
