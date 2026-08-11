import { writeTerminal } from '../terminal-output.mjs';
import { formatCommandMessage, formatCustomToolMessage, formatInfoMessage, formatMcpMessage, formatSystemMessage } from '../shell-display.mjs';
import { isMcpToolCall, isShellToolCall, responseItemToTranscript } from './response-format.mjs';

const PINK = '\u001b[38;5;213m';
const REASONING_LIME = '\u001b[38;5;230m';
const UNDERLINE = '\u001b[4m';
const UNDERLINE_OFF = '\u001b[24m';
const RESET = '\u001b[0m';
const WHITE = '\u001b[38;5;255m';

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
  return `${REASONING_LIME}${text}${RESET}`;
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

export function createLiveResponseHandlers({ liveStreaming, statusController, debug = false, noReasoning = false, noShellCalls = false, noToolCalls = false, noMcp = false, noWebsearch = false }) {
  let sawOutput = false;
  let streamedText = '';
  let streamedReasoningSummary = false;
  let reasoningHeaderBuffer = '';
  let reasoningHeaderDone = false;
  let pendingAnsi = '';
  let textOutputStarted = false;

  const writeTextDelta = (text) => {
    const input = `${pendingAnsi}${text}`;
    pendingAnsi = '';
    let output = '';
    let index = 0;
    while (index < input.length) {
      if (input[index] !== '\u001b') { output += input[index++]; continue; }
      if (index + 1 >= input.length) { pendingAnsi = input.slice(index); break; }
      if (input[index + 1] !== '[') { output += input[index++]; continue; }
      let end = index + 2;
      while (end < input.length && !(input.charCodeAt(end) >= 0x40 && input.charCodeAt(end) <= 0x7e)) end += 1;
      if (end >= input.length) { pendingAnsi = input.slice(index); break; }
      output += input.slice(index, end + 1);
      index = end + 1;
    }
    if (!output) return;
    writeTerminal(`${textOutputStarted ? '' : WHITE}${output}`);
    textOutputStarted = true;
  };

  const flushTextDelta = () => {
    if (pendingAnsi) { writeTextDelta(pendingAnsi); pendingAnsi = ''; }
  };

  const markOutput = () => {
    if (sawOutput) return;
    sawOutput = true;
    statusController?.beginWriting();
  };

  const startWebSearch = (stage) => {
    if (!statusController) return;
    statusController.showExecuting(0, 0, { renderNow: false });
    statusController.pause();
    writeTerminal(`${webSearchStatusLine(stage)}\n`);
  };

  const finishWebSearch = (item) => {
    if (!statusController) return;
    const completionLine = webSearchCompletionLine(item);
    if (!completionLine) return;
    statusController.showReasoning({ renderNow: false });
    writeTerminal(`${completionLine}\n`);
    statusController.resume();
  };

  const showReasoningSummaryDelta = (delta) => {
    if (delta === undefined || delta === null || delta === '') return;
    streamedReasoningSummary = true;
    statusController?.pause();
    reasoningHeaderBuffer += String(delta);
    if (!reasoningHeaderDone) {
      const start = reasoningHeaderBuffer.indexOf('**');
      const end = start < 0 ? -1 : reasoningHeaderBuffer.indexOf('**', start + 2);
      if (start >= 0 && end >= 0) {
        const before = reasoningHeaderBuffer.slice(0, start);
        const header = reasoningHeaderBuffer.slice(start + 2, end);
        const after = reasoningHeaderBuffer.slice(end + 2);
        writeTerminal(colorizeReasoningSummary(before) + `${REASONING_LIME}${UNDERLINE}${header}${UNDERLINE_OFF}${REASONING_LIME}${after}${RESET}`);
        reasoningHeaderBuffer = '';
        reasoningHeaderDone = true;
      }
      return;
    }
    writeTerminal(colorizeReasoningSummary(reasoningHeaderBuffer));
    reasoningHeaderBuffer = '';
  };

  const reasoningSummaryDelta = (event) => event?.delta ?? event?.text ?? event?.summary_text;

  const finishReasoningSummary = () => {
    if (reasoningHeaderBuffer) {
      writeTerminal(colorizeReasoningSummary(reasoningHeaderBuffer));
      reasoningHeaderBuffer = '';
    }
    if (!statusController) return;
    writeTerminal('\n');
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
      if (line) writeTerminal(`${formatInfoMessage(line)}\n`);
    }
  };

  return {
    flushTextDelta,
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
          if (noReasoning) return;
          if (debug) return;
          if (event.type.endsWith('.delta')) showReasoningSummaryDelta(reasoningSummaryDelta(event));
          else if (event.type.endsWith('.done')) finishReasoningSummary();
          return;
        }
        if (isMcpEvent(event)) {
          if (noMcp) return;
          if (debug && event.type === 'response.mcp_call_arguments.delta') return;
          if (event.type === 'response.mcp_call_arguments.delta') {
            markOutput();
            const delta = String(event?.delta ?? '');
            if (delta) writeTerminal(formatMcpMessage(delta));
            return;
          }
          handleMcpEvent(event);
          return;
        }
        if (isWebSearchEvent(event)) {
          if (noWebsearch) return;
          if (event.type.endsWith('.in_progress')) {
            startWebSearch('in_progress');
            return;
          }
          if (event.type.endsWith('.searching')) {
            writeTerminal(`${webSearchStatusLine('searching')}\n`);
            return;
          }
          if (event.type.endsWith('.completed')) {
            return;
          }
        }
        if (isFunctionCallArgumentsDeltaEvent(event) || isShellCallCommandDeltaEvent(event)) {
          if (isShellCallCommandDeltaEvent(event) ? noShellCalls : noToolCalls) return;
          markOutput();
          const delta = String(event?.delta ?? '');
          if (delta) {
            streamedText += delta;
            const formatted = isShellCallCommandDeltaEvent(event) ? formatCommandMessage(delta) : formatCustomToolMessage(delta);
            writeTerminal(formatted);
          }
        }
      },
      onItemAdded(item) {
        if (!isMcpToolCall(item) || noMcp) return;
        markOutput();
        statusController?.pause();
        statusController?.beginWriting();
        const label = item.name || item.server_label || 'mcp_call';
        writeTerminal(formatMcpMessage(`${label}(`));
      },
      onTextDelta(delta) {
        markOutput();
        const text = String(delta ?? '');
        streamedText += text;
        writeTextDelta(text);
      },
      onItemDone(item) {
        if (item?.type === 'web_search_call') {
          if (noWebsearch) return;
          finishWebSearch(item);
          return;
        }
        const isCustomToolCall = item?.type === 'function_call' || item?.type === 'custom_call';
        if (isMcpToolCall(item) && noMcp) return;
        if (isShellToolCall(item) && noShellCalls) return;
        if (isCustomToolCall && noToolCalls) return;
        if (isShellToolCall(item) || isMcpToolCall(item) || isCustomToolCall) {
          markOutput();
          if (isMcpToolCall(item)) writeTerminal(formatMcpMessage(')'));
          streamedText += '\n';
          writeTerminal('\n');
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
          if (noReasoning) return;
          if (debug) return;
          const transcript = responseItemToTranscript(item);
          if (transcript && !streamedReasoningSummary) writeTerminal(`${formatSystemMessage(transcript)}\n`);
        }
      },
    } : null,
  };
}
