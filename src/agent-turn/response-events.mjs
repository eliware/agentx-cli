import { writeTerminal } from "../terminal-output.mjs";
import { formatSystemMessage } from "../shell-display.mjs";
import { isMcpToolCall, isShellToolCall, responseItemToTranscript } from "./response-format.mjs";
import { createResponseTextRenderer } from "./response-text-renderer.mjs";
import { createReasoningSummaryRenderer } from "./reasoning-summary-renderer.mjs";
import { createWebSearchRenderer } from "./web-search-renderer.mjs";
import { createMcpEventRenderer } from "./mcp-event-renderer.mjs";
import { createToolEventRenderer } from "./tool-event-renderer.mjs";

function isResponseCompletedEvent(event, raw) {
  if (event?.type === "response.completed") return true;
  return typeof raw === "string" && raw.includes('"type":"response.completed"');
}

function isFunctionCallArgumentsDeltaEvent(event) {
  return event?.type === "response.function_call_arguments.delta";
}

function isShellCallCommandDeltaEvent(event) {
  return event?.type === "response.shell_call_command.delta";
}

function isWebSearchEvent(event) {
  return typeof event?.type === "string" && event.type.startsWith("response.web_search_call.");
}

function isMcpEvent(event) {
  return typeof event?.type === "string" && event.type.startsWith("response.mcp_");
}

function isReasoningSummaryEvent(event) {
  return typeof event?.type === "string" && event.type.startsWith("response.reasoning_summary_");
}

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

  const reasoningSummaryDelta = (event) => event?.delta ?? event?.text ?? event?.summary_text;

  return {
    flushTextDelta,
    sawOutput: () => sawOutput,
    streamedText: () => streamedText,
    handlers: liveStreaming
      ? {
          onEvent(event, message) {
            if (isResponseCompletedEvent(event, message?.raw)) {
              // Do not erase the line after the final text has been streamed. The
              // cursor may already be at the start of the next line, which makes
              // the terminal control sequence look like it removed the last line.
              return;
            }
            if (isReasoningSummaryEvent(event)) {
              if (noReasoning) return;
              if (debug) return;
              if (event.type.endsWith(".delta"))
                reasoningRenderer.writeDelta(reasoningSummaryDelta(event));
              else if (event.type.endsWith(".done")) reasoningRenderer.finish();
              return;
            }
            if (isMcpEvent(event)) {
              if (noMcpOutput) return;
              if (debug && event.type === "response.mcp_call_arguments.delta") return;
              if (event.type === "response.mcp_call_arguments.delta") {
                mcpRenderer.writeArguments(event);
                return;
              }
              mcpRenderer.handleEvent(event);
              return;
            }
            if (isWebSearchEvent(event)) {
              if (noWebsearch) return;
              if (event.type.endsWith(".in_progress")) {
                webSearchRenderer.start();
                return;
              }
              if (event.type.endsWith(".searching")) {
                webSearchRenderer.searching();
                return;
              }
              if (event.type.endsWith(".completed")) {
                return;
              }
            }
            if (isFunctionCallArgumentsDeltaEvent(event) || isShellCallCommandDeltaEvent(event)) {
              if (isShellCallCommandDeltaEvent(event) ? noShellCalls : noToolCalls) return;
              markOutput();
              const delta = String(event?.delta ?? "");
              if (delta) {
                streamedText += toolEventRenderer.writeDelta(event);
              }
            }
          },
          onItemAdded(item) {
            if (!isMcpToolCall(item) || noMcpOutput) return;
            mcpRenderer.addCall(item);
          },
          onTextDelta(delta) {
            markOutput();
            const text = String(delta ?? "");
            streamedText += text;
            writeTextDelta(text);
          },
          onItemDone(item) {
            if (item?.type === "web_search_call") {
              if (noWebsearch) return;
              webSearchRenderer.finish(item);
              return;
            }
            const isCustomToolCall = item?.type === "function_call" || item?.type === "custom_call";
            if (isMcpToolCall(item) && noMcpOutput) return;
            if (isShellToolCall(item) && noShellCalls) return;
            if (isCustomToolCall && noToolCalls) return;
            if (isShellToolCall(item) || isMcpToolCall(item) || isCustomToolCall) {
              markOutput();
              if (isMcpToolCall(item)) {
                streamedText += mcpRenderer.finishCall();
              } else {
                streamedText += toolEventRenderer.finishItem();
              }
            }
            if (item?.type === "reasoning") {
              if (noReasoning) return;
              if (debug) return;
              const transcript = responseItemToTranscript(item);
              if (transcript && !reasoningRenderer.hasStreamedSummary())
                writeTerminal(`${formatSystemMessage(transcript)}\n`);
            }
          },
        }
      : null,
  };
}
