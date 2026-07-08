import { extractTextFromResponse, extractUsage } from './response.mjs';
import { runToolCall, toolOutputForCall } from './tool-dispatch.mjs';
import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { clearSession, persistResponseState, readSessionState } from './session-state.mjs';
import { formatTurnUsageReport, formatUsageReport } from './usage.mjs';
import { createUsageTotals } from './response.mjs';
import { formatCommandMessage, formatInfoMessage, formatSystemMessage } from './shell-display.mjs';

const SHELL_OUTPUT_PREVIEW = 120;
const STATUS_UPDATE_INTERVAL_MS = 250;
const GREEN = '\u001b[32m';
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

function formatTransactionCompletionMessage(summary) {
  return JSON.stringify({ 'transaction.completed': summary });
}

function formatSpinnerFrame() {
  return '';
}

function createStatusLineController(sessionStartedAt = Date.now()) {
  let timer = null;
  let lastRendered = '';
  let state = null;
  let stateStartedAt = 0;
  const phases = {
    reasoning: { lastMs: 0, totalMs: 0 },
    executing: { lastMs: 0, totalMs: 0 },
    writing: { lastMs: 0, totalMs: 0 },
  };

  function clearRenderedLine() {
    if (!lastRendered) return;
    process.stdout.write('\r\x1b[2K');
    lastRendered = '';
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(render, STATUS_UPDATE_INTERVAL_MS);
  }

  function finalizeActive(now = Date.now()) {
    if (!state) return;
    const elapsed = Math.max(0, now - stateStartedAt);
    const phase = phases[state];
    if (phase) {
      phase.lastMs = elapsed;
      phase.totalMs += elapsed;
    }
  }

  function phaseSnapshot(name, now = Date.now()) {
    const phase = phases[name];
    const active = state === name;
    const elapsed = active ? Math.max(0, now - stateStartedAt) : phase.lastMs;
    const total = active ? phase.totalMs + elapsed : phase.totalMs;
    const pair = `${formatElapsedStatus(elapsed)}/${formatElapsedStatus(total)}`;
    return active ? `${GREEN}${pair}${RESET}` : pair;
  }

  function snapshot(now = Date.now()) {
    return {
      time: formatElapsedStatus(now - sessionStartedAt),
      reason: phaseSnapshot('reasoning', now),
      exec: phaseSnapshot('executing', now),
      writing: phaseSnapshot('writing', now),
    };
  }

  function writeLine(text) {
    if (text === lastRendered) return;
    clearRenderedLine();
    process.stdout.write(text);
    lastRendered = text;
  }

  function render() {
    if (!state || state === 'writing') return;
    const stats = snapshot();
    writeLine(`[${stats.time}] {"time":"${stats.time}","reason":"${stats.reason}","exec":"${stats.exec}","writing":"${stats.writing}"}`);
  }

  function transition(nextState, { renderNow = true } = {}) {
    const now = Date.now();
    if (state === nextState) {
      if (renderNow) render();
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
    startTimer();
    if (renderNow) render();
  }

  return {
    showReasoning() {
      transition('reasoning');
    },
    showExecuting(done, total) {
      transition('executing');
      render();
    },
    updateExecuting(done, total) {
      if (state !== 'executing') return;
      render();
    },
    beginWriting() {
      transition('writing', { renderNow: false });
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
      stopTimer();
      clearRenderedLine();
    },
  };
}

function textFromContent(content) {
  const parts = [];
  for (const part of content ?? []) {
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
  return item?.type === 'shell_call' || (item?.type === 'function_call' && item?.name === 'shell_call');
}

function shellFunctionCallPreview(item) {
  const raw = String(item?.input ?? item?.arguments ?? '{}');
  if (raw.includes('not valid json')) return raw;
  return compactJson(JSON.parse(raw));
}

export function responseItemToTranscript(item) {
  if (!item || item.role === 'developer' || item.role === 'system') return '';

  if (item.type === 'message') {
    const role = item.role || 'message';
    const text = textFromContent(item.content);
    return text ? `${role}: ${text}` : '';
  }

  if (item.type === 'function_call') {
    if (item.name === 'shell_call') {
      return `assistant shell call: ${shellFunctionCallPreview(item)}`;
    }
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
    return summary ? `assistant reasoning summary: ${summary}` : '';
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

function createLiveResponseHandlers({ liveStreaming, statusController }) {
  let sawOutput = false;
  let streamedText = '';

  const markOutput = () => {
    if (sawOutput) return;
    sawOutput = true;
    statusController?.beginWriting();
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
        if (!isFunctionCallArgumentsDeltaEvent(event)) return;
        markOutput();
        const delta = String(event?.delta ?? '');
        if (delta) {
          streamedText += delta;
          process.stdout.write(formatCommandMessage(delta));
        }
      },
      onTextDelta(delta) {
        markOutput();
        const text = String(delta ?? '');
        streamedText += text;
        process.stdout.write(text);
      },
      onItemDone(item) {
        if (isShellToolCall(item)) {
          markOutput();
          streamedText += '\n';
          process.stdout.write('\n');
        }
        if (item?.type === 'reasoning') {
          const transcript = responseItemToTranscript(item);
          if (transcript) process.stdout.write(`${formatSystemMessage(transcript)}\n`);
        }
      },
    } : null,
  };
}

async function createStreamedResponse(openai, request, { liveStreaming = false, statusController = null } = {}) {
  if (liveStreaming) statusController?.showReasoning();
  const live = createLiveResponseHandlers({ liveStreaming, statusController });
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
  const statusController = streamOptions?.statusController || (liveStreaming ? createStatusLineController(sessionStartedAt) : null);
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
      process.stdout.write(`${formatSystemMessage(formatTurnUsageReport(usage))}\n`);
      if (cumulativeUsage) {
        process.stdout.write(`${formatSystemMessage(formatUsageReport(cumulativeUsage))}\n`);
      }
    }
    if (calls.length === 0) {
      statusController?.clear();
      process.stdout.write(`${formatInfoMessage(formatTransactionCompletionMessage(statusController?.snapshot?.() ?? { time: formatElapsedStatus(Date.now() - sessionStartedAt), reason: '0s/0s', exec: '0s/0s', writing: '0s/0s' }))}\n`);
      return current;
    }

    isFirstResponse = false;
    statusController?.showExecuting(0, calls.length);
    let completed = 0;
    let results;
    try {
      results = await Promise.all(calls.map(async (call, callIndex) => {
        try {
          const output = await runToolCallFn(call, cwd, { isFirstResponse, currentResponse: current, callIndex, callCount: calls.length });
          return { call, output };
        } finally {
          completed += 1;
          statusController?.updateExecuting(completed, calls.length);
        }
      }));
    } finally {
      statusController?.clear();
    }

    const outputs = [];
    for (const { call, output } of results) {
      outputs.push(toolOutputForCall(call, output));
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
  const statusController = streamOptions?.statusController || createStatusLineController(sessionStartedAt);
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
