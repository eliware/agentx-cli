import { extractTextFromResponse, extractUsage } from './response.mjs';
import { runToolCall, toolOutputForCall } from './tool-dispatch.mjs';
import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { clearSession, persistResponseState, readSessionState } from './session-state.mjs';
import { formatTurnUsageReport } from './usage.mjs';
import { formatCommandMessage, formatSystemMessage } from './shell-display.mjs';

const SHELL_OUTPUT_PREVIEW = 120;

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

function debugLogOpenAIRequest(request) {
  if (!process.argv.includes('--debug')) return;
  console.log('OpenAI request:', JSON.stringify(request, null, 2));
}

function debugLogOpenAIResponse(response) {
  if (!process.argv.includes('--debug')) return;
  console.log('OpenAI response:', JSON.stringify(response, null, 2));
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

function createLiveResponseHandlers({ liveStreaming }) {
  let sawOutput = false;
  let streamedText = '';

  const markOutput = () => {
    if (sawOutput) return;
    sawOutput = true;
  };

  return {
    sawOutput: () => sawOutput,
    streamedText: () => streamedText,
    handlers: liveStreaming ? {
      /* c8 ignore next 12 */
      onEvent(event, message) {
        if (isResponseCompletedEvent(event, message?.raw)) return;
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

async function createStreamedResponse(openai, request, { liveStreaming = false } = {}) {
  const live = createLiveResponseHandlers({ liveStreaming });
  const response = await openai.responses.create(request, live.handlers || undefined);
  if (liveStreaming && live.sawOutput() && !live.streamedText().endsWith('\n')) {
    process.stdout.write('\n');
  }
  debugLogOpenAIResponse(response);
  return response;
}

export async function handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCallFn = runToolCall, streamOptions = {}) {
  let current = response;
  const liveStreaming = Boolean(streamOptions?.liveStreaming);

  for (; ;) {
    const usage = extractUsage(current);
    if (onResponseUsage) onResponseUsage(usage);
    const calls = (current?.output ?? []).filter((item) => isShellToolCall(item));
    if (calls.length === 0) return current;

    process.stdout.write(`${formatSystemMessage(formatTurnUsageReport(usage))}\n`);

    const results = await Promise.all(calls.map(async (call) => ({
      call,
      output: await runToolCallFn(call, cwd),
    })));

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
    debugLogOpenAIRequest(request);
    current = await createStreamedResponse(openai, request, liveStreaming ? { liveStreaming } : undefined);
  }
}

export async function sendMessage(openai, template, previousResponseId, userMessage, agentsText, cwd, onResponseUsage, requestOverride = null, streamOptions = {}) {
  const baseRequest = JSON.parse(JSON.stringify(template));
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

  const response = await createStreamedResponse(openai, request, streamOptions?.liveStreaming ? { liveStreaming: true } : undefined);
  return await handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCall, streamOptions);
}

export { persistResponseState, clearSession, readSessionState, extractTextFromResponse, extractUsage, formatTurnUsageReport };
export { formatUsageSummary } from './response.mjs';
