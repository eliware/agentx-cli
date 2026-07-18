import { extractTextFromResponse, extractUsage } from './response.mjs';
import { runToolCall, toolOutputForCall } from './tool-dispatch.mjs';
import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { clearSession, persistResponseState, readSessionState } from './session-state.mjs';
import { formatTurnUsageReport, formatUsageReport } from './usage.mjs';
import { createUsageTotals } from './response.mjs';
import { formatCommandMessage, formatInfoMessage, formatMcpMessage, formatSystemMessage } from './shell-display.mjs';

const SHELL_OUTPUT_PREVIEW = 120;
const STATUS_UPDATE_INTERVAL_MS = 250;
const GREEN = '\u001b[32m';
const PINK = '\u001b[95m';
const LIGHT_ORANGE = '\u001b[38;5;214m';
const RESET = '\u001b[0m';

function formatElapsedStatus(elapsedMs) {
  const totalSeconds = Math.max(0, Math.round(Number(elapsedMs ?? 0) / 1000));
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }
  return `${totalSeconds}s`;
}

function stripStatusValue(value) {
  if (value && typeof value === 'object' && 'value' in value) return String(value.value ?? '');
  if (typeof value !== 'string') return String(value ?? '');
  return value.replace(/^([a-z]+):\s+/, '').replace(/\[[0-9;]*m/g, '');
}

function formatTransactionCompletionMessage(summary) {
  return JSON.stringify({
    time: String(summary?.time ?? ''),
    reasoning: stripStatusValue(summary?.reasoning),
    writing: stripStatusValue(summary?.writing),
    executing: stripStatusValue(summary?.executing),
  });
}

function formatSpinnerFrame() {
  return '';
}

function createStatusLineController(sessionStartedAt = Date.now(), { quiet = false } = {}) {
  let timer = null;
  let lastRendered = '';
  let state = null;
  let stateStartedAt = 0;
  let paused = false;
  const phases = {
    reasoning: { lastMs: 0, totalMs: 0 },
    executing: { lastMs: 0, totalMs: 0 },
    writing: { lastMs: 0, totalMs: 0 },
  };

  function clearRenderedLine() {
    if (quiet || !lastRendered) return;
    process.stdout.write('\r\x1b[2K');
    lastRendered = '';
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    if (quiet || timer || paused) return;
    timer = setInterval(render, STATUS_UPDATE_INTERVAL_MS);
  }

  function finalizeActive(now = Date.now()) {
    if (!state) return;
    const elapsed = Math.max(0, now - stateStartedAt);
    const phase = phases[state];
    phase.lastMs = elapsed;
    phase.totalMs += elapsed;
  }

  function phaseSnapshot(name, now) {
    const phase = phases[name];
    const active = state === name;
    const elapsed = active ? Math.max(0, now - stateStartedAt) : phase.lastMs;
    const total = active ? phase.totalMs + elapsed : phase.totalMs;
    return {
      active,
      value: `${formatElapsedStatus(elapsed)}/${formatElapsedStatus(total)}`,
    };
  }

  function formatStatusField(name, snapshotValue) {
    const field = `"${name}":"${snapshotValue.value}"`;
    return snapshotValue.active ? `${GREEN}${field}${RESET}` : field;
  }

  function snapshot(now = Date.now()) {
    return {
      time: formatElapsedStatus(now - sessionStartedAt),
      reasoning: phaseSnapshot('reasoning', now),
      writing: phaseSnapshot('writing', now),
      executing: phaseSnapshot('executing', now),
    };
  }

  function writeLine(text) {
    if (text === lastRendered) return;
    clearRenderedLine();
    process.stdout.write(text);
    lastRendered = text;
  }

  function render() {
    if (quiet || paused || !state || state === 'writing') return;
    const stats = snapshot();
    writeLine(`{"time":"${stats.time}",${formatStatusField('reasoning', stats.reasoning)},${formatStatusField('writing', stats.writing)},${formatStatusField('executing', stats.executing)}}`);
  }

  function transition(nextState, { renderNow = true }) {
    const now = Date.now();
    if (state === nextState) {
      if (!paused && renderNow) render();
      return;
    }
    finalizeActive(now);
    state = nextState;
    stateStartedAt = now;
    if (nextState === 'writing') {
      stopTimer();
      clearRenderedLine();
      return;
    }
    if (paused) return;
    startTimer();
    if (renderNow) render();
  }

  return {
    showReasoning(options = {}) {
      transition('reasoning', options);
    },
    showExecuting(done, total, options = {}) {
      transition('executing', options);
    },
    updateExecuting(_done, _total) {
      if (state !== 'executing' || paused) return;
      render();
    },
    beginWriting(options = {}) {
      transition('writing', options);
    },
    pause() {
      paused = true;
      stopTimer();
      clearRenderedLine();
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (state && state !== 'writing') {
        startTimer();
        render();
      }
    },
    snapshot() {
      return snapshot();
    },
    refresh() {
      render();
    },
    clear() {
      finalizeActive();
      state = null;
      stateStartedAt = 0;
      paused = false;
      stopTimer();
      clearRenderedLine();
    },
  };
}

function textFromContent(content) {
  if (content == null) return undefined;
  const parts = [];
  for (const part of content) {
    if (part?.text) parts.push(String(part.text));
    else if (part?.type === 'input_text' || part?.type === 'output_text') parts.push(String(part.text ?? ''));
    else if (part?.type === 'refusal' && part.refusal) parts.push(`[refusal] ${part.refusal}`);
  }
  return parts.filter(Boolean).join('\n');
}

function compactJson(value) {
  return JSON.stringify(value, (key, nested) => {
    if (key === 'encrypted_content') return '[encrypted reasoning omitted]';
    if (key === 'result' && typeof nested === 'string' && nested.length > 500) return `[large result omitted: ${nested.length} chars]`;
    if (key === 'output' && Array.isArray(nested)) {
      return nested.map((chunk) => {
        if (!chunk || typeof chunk !== 'object') return chunk;
        return {
          stdout: String(chunk.stdout ?? '').slice(0, SHELL_OUTPUT_PREVIEW),
          stderr: String(chunk.stderr ?? '').slice(0, SHELL_OUTPUT_PREVIEW),
          outcome: chunk.outcome,
        };
      });
    }
    return nested;
  });
}

function shellOutputPreview(item) {
  const chunks = Array.isArray(item?.output) ? item.output : [];
  return chunks.map((chunk) => ({
    stdout: String(chunk?.stdout ?? '').slice(0, SHELL_OUTPUT_PREVIEW),
    stderr: String(chunk?.stderr ?? '').slice(0, SHELL_OUTPUT_PREVIEW),
    outcome: chunk?.outcome ?? null,
  }));
}

function isShellToolCall(item) {
  return item?.type === 'shell_call';
}

function isMcpToolCall(item) {
  return item?.type === 'mcp_call';
}

export function responseItemToTranscript(item) {
  if (!item || item.role === 'developer' || item.role === 'system') return '';

  if (item.type === 'message') {
    const role = item.role || 'message';
    const text = textFromContent(item.content);
    return text ? `${role}: ${text}` : '';
  }

  if (item.type === 'function_call') {
    return `assistant tool call: ${item.name || 'function'}(${item.arguments || item.input || ''})`;
  }

  if (item.type === 'shell_call') {
    return `assistant shell call: ${compactJson({ call_id: item.call_id, action: item.action, status: item.status })}`;
  }

  if (item.type === 'function_call_output') {
    return `tool output: ${item.output ?? ''}`;
  }

  if (item.type === 'shell_call_output') {
    return `tool output shell_call_output: ${compactJson({ call_id: item.call_id, max_output_length: item.max_output_length, status: item.status, output: shellOutputPreview(item) })}`;
  }

  if (item.type === 'reasoning') {
    const summary = textFromContent(item.summary);
    return summary ?? '';
  }

  if (item.type?.endsWith?.('_call')) {
    return `assistant ${item.type}: ${compactJson(item)}`;
  }

  if (item.type?.endsWith?.('_call_output')) {
    return `tool output ${item.type}: ${compactJson(item)}`;
  }

  return `${item.role || item.type || 'item'}: ${compactJson(item)}`;
}

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

function createLiveResponseHandlers({ liveStreaming, statusController, debug = false }) {
  let sawOutput = false;
  let streamedText = '';

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
    if (!delta) return;
    statusController?.pause();
    process.stdout.write(colorizeReasoningSummary(String(delta)));
  };

  const finishReasoningSummary = () => {
    if (!statusController) return;
    process.stdout.write('\n');
    statusController.resume();
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
      /* c8 ignore next 12 */
      onEvent(event, message) {
        if (isResponseCompletedEvent(event, message?.raw)) {
          statusController?.clear();
          return;
        }
        if (isReasoningSummaryEvent(event)) {
          if (debug) return;
          if (event.type.endsWith('.delta')) showReasoningSummaryDelta(event.delta);
          else if (event.type.endsWith('.done')) finishReasoningSummary();
          return;
        }
        if (isMcpEvent(event)) {
          if (debug && (event.type === 'response.mcp_call_arguments.delta' || event.type === 'response.reasoning_summary_text.delta')) return;
          if (event.type === 'response.mcp_call_arguments.delta') {
            markOutput();
            statusController?.beginWriting();
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
        const label = item.name || item.server_label || 'mcp_call';
        process.stdout.write(formatMcpMessage(`assistant mcp call: ${label}(`));
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
          streamedText += '\n';
          process.stdout.write(isMcpToolCall(item) ? ')\n' : '\n');
        }
        if (item?.type === 'reasoning') {
          if (debug) return;
          const transcript = responseItemToTranscript(item);
          if (transcript) process.stdout.write(`${formatSystemMessage(transcript)}\n`);
        }
      },
    } : null,
  };
}

async function createStreamedResponse(openai, request, { liveStreaming = false, statusController = null } = {}) {
  if (liveStreaming) statusController?.showReasoning();
  const live = createLiveResponseHandlers({ liveStreaming, statusController, ...(process.argv.includes('--debug') ? { debug: true } : {}) });
  const response = await openai.responses.create(request, live.handlers || undefined);
  if (liveStreaming && live.sawOutput() && !live.streamedText().endsWith('\n')) {
    process.stdout.write('\n');
  }
  statusController?.clear();
  return response;
}

export async function handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCallFn = runToolCall, streamOptions = {}) {
  let current = response;
  const liveStreaming = Boolean(streamOptions?.liveStreaming);
  const sessionStartedAt = streamOptions?.sessionStartedAt ?? Date.now();
  const statusController = streamOptions?.statusController || (liveStreaming ? createStatusLineController(sessionStartedAt, { quiet: Boolean(streamOptions?.suppressStatusOutput) }) : null);
  const onResponseState = streamOptions?.onResponseState;
  const skipInitialUsageAccounting = Boolean(streamOptions?.skipInitialUsageAccounting);
  let isFirstResponse = true;

  for (; ;) {
    const shouldReportUsage = !(skipInitialUsageAccounting && isFirstResponse);
    const usage = shouldReportUsage ? extractUsage(current) : createUsageTotals();
    const calls = (current?.output ?? []).filter((item) => isShellToolCall(item));
    const cumulativeUsage = shouldReportUsage && onResponseUsage ? onResponseUsage(usage, { skipIncrement: false }) : null;
    if (onResponseState) {
      await onResponseState({ response: current, pendingToolCalls: calls, isInitialResponse: isFirstResponse, cumulativeUsage });
    }
    if (shouldReportUsage) {
      process.stdout.write(`${formatSystemMessage(formatTurnUsageReport({ ...usage, model: baseRequest?.model }))}\n`);
      if (cumulativeUsage) {
        process.stdout.write(`${formatSystemMessage(formatUsageReport({ ...cumulativeUsage, model: baseRequest?.model }))}\n`);
      }
    }
    if (calls.length === 0) {
      statusController?.clear();
      process.stdout.write(`${formatInfoMessage(formatTransactionCompletionMessage(statusController?.snapshot?.() ?? { time: formatElapsedStatus(Date.now() - sessionStartedAt), reasoning: '0s/0s', writing: '0s/0s', executing: '0s/0s' }))}\n`);
      return current;
    }

    isFirstResponse = false;
    statusController?.showExecuting(0, calls.length);
    const outputs = [];
    let completed = 0;
    try {
      for (const [callIndex, call] of calls.entries()) {
        const output = await runToolCallFn(call, cwd, { isFirstResponse, currentResponse: current, callIndex, callCount: calls.length });
        outputs.push(toolOutputForCall(call, output));
        completed += 1;
        statusController?.updateExecuting(completed, calls.length);
      }
    } finally {
      statusController?.clear();
    }

    const request = {
      ...baseRequest,
      input: outputs,
      previous_response_id: current.id,
      store: true,
    };
    current = await createStreamedResponse(openai, request, liveStreaming ? { liveStreaming, statusController } : { statusController });
  }
}

export async function sendMessage(openai, template, previousResponseId, userMessage, agentsText, cwd, onResponseUsage, requestOverride = null, streamOptions = {}) {
  const baseRequest = JSON.parse(JSON.stringify(template));
  const sessionStartedAt = streamOptions?.sessionStartedAt ?? Date.now();
  const statusController = streamOptions?.statusController || createStatusLineController(sessionStartedAt, { quiet: Boolean(streamOptions?.suppressStatusOutput) });
  const request = requestOverride ? { ...baseRequest, ...requestOverride } : (previousResponseId
    ? {
      ...baseRequest,
      input: [buildInputMessage(userMessage)],
      store: true,
      previous_response_id: previousResponseId,
    }
    : {
      ...applyFirstUserMessage(baseRequest, userMessage, agentsText, cwd),
      store: true,
    });

  const response = await createStreamedResponse(openai, request, streamOptions?.liveStreaming ? { liveStreaming: true, statusController } : { statusController });
  return await handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCall, { ...streamOptions, statusController });
}

export { persistResponseState, clearSession, readSessionState, extractTextFromResponse, extractUsage, formatTurnUsageReport, formatElapsedStatus, formatSpinnerFrame, formatTransactionCompletionMessage, createStatusLineController, createStreamedResponse };
export { formatUsageSummary } from './response.mjs';
