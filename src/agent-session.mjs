import { extractTextFromResponse, extractUsage, formatUsageSummary, isFunctionCall } from './response.mjs';
import { runToolCall, toolCallSummary } from './tool-dispatch.mjs';
import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { clearSession, persistResponseState, readSessionState } from './session-state.mjs';
import { formatTurnUsageReport } from './usage.mjs';

const MAX_RESPONSE_CHAIN = 200;

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
    return nested;
  });
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

  if (item.type === 'function_call_output') {
    return `tool output: ${item.output ?? ''}`;
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

async function listResponseInputItems(openai, responseId) {
  const items = [];
  const list = openai.responses.inputItems?.list;
  if (!list) return items;
  for await (const item of list.call(openai.responses.inputItems, responseId, { order: 'asc' })) {
    items.push(item);
  }
  return items;
}

export async function collectStoredResponseItems(openai, latestResponseId) {
  const turns = [];
  const seen = new Set();
  let responseId = latestResponseId;

  while (responseId && !seen.has(responseId) && seen.size < MAX_RESPONSE_CHAIN) {
    seen.add(responseId);
    const response = await openai.responses.retrieve(responseId);
    const input = await listResponseInputItems(openai, responseId);
    turns.push({ input, output: response?.output ?? [] });
    responseId = response?.previous_response_id || '';
  }

  return turns.reverse().flatMap((turn) => [...turn.input, ...turn.output]);
}

export async function handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCallFn = runToolCall) {
  let current = response;
  for (; ;) {
    if (onResponseUsage) onResponseUsage(extractUsage(current));
    const calls = (current?.output ?? []).filter(isFunctionCall);
    if (calls.length === 0) return current;

    const results = await Promise.all(calls.map(async (call) => ({
      call,
      output: await runToolCallFn(call, cwd),
    })));

    const outputs = [];
    for (const { call, output } of results) {
      process.stdout.write(`${toolCallSummary(call, output)}\n`);
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output });
    }

    current = await openai.responses.create({
      ...baseRequest,
      input: outputs,
      previous_response_id: current.id,
      store: true,
    });
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

  let response = await openai.responses.create(request);
  response = await handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage);
  return response;
}

export { persistResponseState, clearSession, readSessionState, extractTextFromResponse, extractUsage, formatUsageSummary, formatTurnUsageReport };
