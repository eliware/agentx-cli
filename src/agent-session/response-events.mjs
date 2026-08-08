import { formatCommandMessage, formatInfoMessage, formatMcpMessage, formatSystemMessage } from '../shell-display.mjs';
import { isMcpToolCall, isShellToolCall, responseItemToTranscript } from './response-format.mjs';

const PINK = '\u001b[95m';
const LIGHT_ORANGE = '\u001b[38;5;214m';
const RESET = '\u001b[0m';

function isResponseCompletedEvent(event, raw) {
  if (event?.type === 'response.completed') return true;
  return typeof raw === 'string' && raw.includes('"type":"response.completed"');
}

function isFunctionCallArgumentsDeltaEvent(event) {
  return event?.type === 'response.function_call_arguments.delta';
}

function isShellCallCommandDeltaEvent(event) {
  return event?.type === 'response.shell_call_command.delta';
}

function isWebSearchEvent(event) {
  return typeof event?.type === 'string' && event.type.startsWith('response.web_search_call.');
}

function isMcpEvent(event) {
  return typeof event?.type === 'string' && event.type.startsWith('response.mcp_');
}

function isReasoningSummaryEvent(event) {
  return typeof event?.type === 'string' && event.type.startsWith('response.reasoning_summary_');
}

function colorizeReasoningSummary(text) {
  return `${LIGHT_ORANGE}${text}${RESET}`;
}

function formatMcpProgress(event) {
  const progress = event?.progress ?? event?.progress_update ?? event?.message ?? event?.data ?? event?.payload ?? event?.status ?? event?.delta;
  if (progress === undefined || progress === null || progress === '') return '';
  return JSON.stringify({ mcp: String(progress) });
}

function colorizePink(text) {
  return `${PINK}${text}${RESET}`;
}

function webSearchStatusLine(stage) {
  return colorizePink(JSON.stringify({ web_search: stage }));
}

function webSearchCompletionLine(item) {
  const queries = Array.isArray(item?.action?.queries) ? item.action.queries.filter(Boolean).map(String) : [];
  const sources = Array.isArray(item?.action?.sources)
    ? item.action.sources.map((source) => String(source?.url ?? source)).filter(Boolean)
    : [];
  if (queries.length === 0 && sources.length === 0) return '';
  return colorizePink(JSON.stringify({
    web_search: 'complete',
    queries,
    sources,
  }, null, 2));
}

export function createLiveResponseHandlers({ liveStreaming, statusController, debug = false }) {
  let sawOutput = false;
  let streamedText = '';
  let streamedReasoningSummary = false;

  const markOutput = () => {
    if (sawOutput) return;
    sawOutput = true;
    statusController?.beginWriting();
  };

  const startWebSearch = (stage) => {
    if (!statusController) return;
    statusController.showExecuting(0, 0, { renderNow: false });
    statusController.pause();
    process.stdout.write(`${webSearchStatusLine(stage)}\n`);
  };

  const finishWebSearch = (item) => {
    if (!statusController) return;
    const completionLine = webSearchCompletionLine(item);
    if (!completionLine) return;
    statusController.showReasoning({ renderNow: false });
    process.stdout.write(`${completionLine}\n`);
    statusController.resume();
  };

  const showReasoningSummaryDelta = (delta) => {
    if (delta === undefined || delta === null || delta === '') return;
    streamedReasoningSummary = true;
    statusController?.pause();
    process.stdout.write(colorizeReasoningSummary(String(delta)));
  };

  const reasoningSummaryDelta = (event) => event?.delta ?? event?.text ?? event?.summary_text;

  const finishReasoningSummary = () => {
    if (!statusController) return;
    process.stdout.write('\n');
    // Do not immediately render a fresh status line after the summary's
    // newline. The next shell-call delta will transition to writing and own
    // the cursor without leaving a temporary line behind.
    statusController.resume({ renderNow: false });
  };

  const handleMcpEvent = (event) => {
    const type = String(event.type);
    if (type.endsWith('.in_progress')) {
      statusController?.showExecuting(0, 0);
      return;
    }
    if (type.endsWith('.completed') || type.endsWith('.failed')) {
      statusController?.showReasoning({ renderNow: false });
      return;
    }
    if (type.includes('progress') || type.includes('update')) {
      statusController?.showExecuting(0, 0, { renderNow: false });
      const line = formatMcpProgress(event);
      if (line) process.stdout.write(`${formatInfoMessage(line)}\n`);
    }
  };

  return {
    sawOutput: () => sawOutput,
    streamedText: () => streamedText,
    handlers: liveStreaming ? {
      onEvent(event, message) {
        if (isResponseCompletedEvent(event, message?.raw)) {
          // Do not erase the line after the final text has been streamed. The
          // cursor may already be at the start of the next line, which makes
          // the terminal control sequence look like it removed the last line.
          return;
        }
        if (isReasoningSummaryEvent(event)) {
          if (debug) return;
          if (event.type.endsWith('.delta')) showReasoningSummaryDelta(reasoningSummaryDelta(event));
          else if (event.type.endsWith('.done')) finishReasoningSummary();
          return;
        }
        if (isMcpEvent(event)) {
          if (debug && event.type === 'response.mcp_call_arguments.delta') return;
          if (event.type === 'response.mcp_call_arguments.delta') {
            markOutput();
            const delta = String(event?.delta ?? '');
            if (delta) process.stdout.write(formatMcpMessage(delta));
            return;
          }
          handleMcpEvent(event);
          return;
        }
        if (isWebSearchEvent(event)) {
          if (event.type.endsWith('.in_progress')) {
            startWebSearch('in_progress');
            return;
          }
          if (event.type.endsWith('.searching')) {
            process.stdout.write(`${webSearchStatusLine('searching')}\n`);
            return;
          }
          if (event.type.endsWith('.completed')) {
            return;
          }
        }
        if (isFunctionCallArgumentsDeltaEvent(event) || isShellCallCommandDeltaEvent(event)) {
          markOutput();
          const delta = String(event?.delta ?? '');
          if (delta) {
            streamedText += delta;
            process.stdout.write(formatCommandMessage(delta));
          }
        }
      },
      onItemAdded(item) {
        if (!isMcpToolCall(item)) return;
        markOutput();
        statusController?.pause();
        statusController?.beginWriting();
        const label = item.name || item.server_label || 'mcp_call';
        process.stdout.write(formatMcpMessage(`${label}(`));
      },
      onTextDelta(delta) {
        markOutput();
        const text = String(delta ?? '');
        streamedText += text;
        process.stdout.write(text);
      },
      onItemDone(item) {
        if (item?.type === 'web_search_call') {
          finishWebSearch(item);
          return;
        }
        if (isShellToolCall(item) || isMcpToolCall(item)) {
          markOutput();
          if (isMcpToolCall(item)) process.stdout.write(formatMcpMessage(')'));
          streamedText += '\n';
          process.stdout.write('\n');
          if (isMcpToolCall(item)) {
            // Keep the status line paused while the next response takes over
            // the terminal. Resume then immediately pause only to preserve
            // the controller transition for callers that observe it; do not
            // allow a render between tool output and final answer.
            statusController?.resume({ renderNow: false });
            statusController?.pause();
          }
        }
        if (item?.type === 'reasoning') {
          if (debug) return;
          const transcript = responseItemToTranscript(item);
          if (transcript && !streamedReasoningSummary) process.stdout.write(`${formatSystemMessage(transcript)}\n`);
        }
      },
    } : null,
  };
}

