import { extractTextFromResponse, extractUsage } from './response.mjs';
import { runToolCall, toolCallSummary, toolOutputForCall } from './tool-dispatch.mjs';
import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { clearSession, persistResponseState, readSessionState } from './session-state.mjs';
import { formatTurnUsageReport } from './usage.mjs';

const SHELL_OUTPUT_PREVIEW = 120;
const THINKING_FRAMES = ['|', '/', '-', '\\'];

export function startThinkingIndicator() {
  let active = true;
  let frameIndex = 0;

  process.stdout.write('\r| Thinking...');

  const timer = setInterval(() => {
    if (!active) return;
    frameIndex = (frameIndex + 1) % THINKING_FRAMES.length;
    process.stdout.write(`\r${THINKING_FRAMES[frameIndex]} Thinking...`);
  }, 500);

  return () => {
    if (!active) return;
    active = false;
    clearInterval(timer);
    process.stdout.write('\r             \r');
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
    return `assistant tool call: ${item.name || 'function'}(${item.arguments || ''})`;
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

export async function handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCallFn = runToolCall) {
  let current = response;
  for (; ;) {
    if (onResponseUsage) onResponseUsage(extractUsage(current));
    const calls = (current?.output ?? []).filter((item) => item?.type === 'shell_call');
    if (calls.length === 0) return current;

    for (const call of calls) {
      process.stdout.write(`${toolCallSummary(call)}\n`);
    }

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
    const stopThinking = startThinkingIndicator();
    try {
      current = await openai.responses.create(request);
      debugLogOpenAIResponse(current);
    } finally {
      stopThinking();
    }
  }
}

export async function sendMessage(openai, template, previousResponseId, userMessage, agentsText, cwd, onResponseUsage, requestOverride = null) {
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

  const stopThinking = startThinkingIndicator();
  let response;
  try {
    response = await openai.responses.create(request);
    debugLogOpenAIResponse(response);
  } finally {
    stopThinking();
  }
  response = await handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage);
  return response;
}

export { persistResponseState, clearSession, readSessionState, extractTextFromResponse, extractUsage, formatTurnUsageReport };
export { formatUsageSummary } from './response.mjs';
