import { extractTextFromResponse, extractUsage, formatUsageSummary, isFunctionCall } from './response.mjs';
import { runToolCall, toolCallSummary } from './tool-dispatch.mjs';
import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { clearSession, persistResponseState, readSessionState } from './session-state.mjs';
import { formatTurnUsageReport } from './usage.mjs';
import { buildDeveloperText } from './prompt-text.mjs';

const MAX_RESPONSE_CHAIN = 200;
const SUMMARY_CHUNK_CHARS = 100_000;
const MIN_SUMMARY_CHUNK_CHARS = 4_000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function isContextWindowExceeded(error) {
  return error?.code === 'context_length_exceeded'
    || error?.error?.code === 'context_length_exceeded'
    || error?.error?.error?.code === 'context_length_exceeded'
    || (Number(error?.status ?? error?.error?.status ?? 0) === 400 && /context window|context_length_exceeded/i.test(String(error?.message ?? '')));
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

function splitTranscriptForSummary(entries) {
  const totalChars = entries.reduce((sum, entry) => sum + entry.length, 0);
  const target = Math.floor(totalChars * 0.75);
  const summaryEntries = [];
  const recentEntries = [];
  let chars = 0;

  for (const entry of entries) {
    if (chars < target && entries.length - summaryEntries.length > 1) {
      summaryEntries.push(entry);
      chars += entry.length;
    } else {
      recentEntries.push(entry);
    }
  }

  return { summaryEntries, recentEntries };
}

function splitTextByChars(text, maxChars) {
  const chunks = [];
  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.slice(index, index + maxChars));
  }
  return chunks;
}

async function summarizeTranscriptChunk(openai, model, transcript, onResponseUsage) {
  const response = await openai.responses.create({
    model,
    store: false,
    input: [
      {
        role: 'developer',
        content: [{ type: 'input_text', text: 'Summarize an AgentX terminal chat transcript for session compaction. Preserve user goals, decisions, files touched, commands run, errors, tool results, current working assumptions, unresolved tasks, and any explicit instructions. Be detailed but avoid filler.' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: `Transcript to summarize:\n\n${transcript}` }],
      },
    ],
  });
  if (onResponseUsage) onResponseUsage(extractUsage(response));
  return extractTextFromResponse(response).trim();
}

async function summarizeTranscript(openai, model, transcript, onResponseUsage, maxChars = SUMMARY_CHUNK_CHARS) {
  const trimmed = transcript.trim();
  if (!trimmed) return '';

  const chunks = splitTextByChars(trimmed, maxChars);
  const summaries = [];
  for (const chunk of chunks) {
    try {
      summaries.push(await summarizeTranscriptChunk(openai, model, chunk, onResponseUsage));
    } catch (error) {
      if (!isContextWindowExceeded(error) || chunk.length <= MIN_SUMMARY_CHUNK_CHARS) throw error;
      summaries.push(await summarizeTranscript(openai, model, chunk, onResponseUsage, Math.max(MIN_SUMMARY_CHUNK_CHARS, Math.floor(maxChars / 2))));
    }
  }

  const combined = summaries.filter(Boolean).join('\n\n');
  if (summaries.length <= 1 || combined.length <= SUMMARY_CHUNK_CHARS) return combined;
  return summarizeTranscript(openai, model, combined, onResponseUsage);
}

export async function compactSession(openai, template, previousResponseId, agentsText, cwd, pendingMessage = '', onResponseUsage) {
  const historyItems = previousResponseId ? await collectStoredResponseItems(openai, previousResponseId) : [];
  const entries = historyItems.map(responseItemToTranscript).filter(Boolean);
  const { summaryEntries, recentEntries } = splitTranscriptForSummary(entries);
  const oldTranscript = summaryEntries.join('\n\n');
  const recentTranscript = recentEntries.join('\n\n');
  const summary = await summarizeTranscript(openai, template.model, oldTranscript, onResponseUsage);
  const baseRequest = clone(template);

  const input = [
    {
      role: 'developer',
      content: [{ type: 'input_text', text: buildDeveloperText(baseRequest, agentsText, cwd) }],
    },
  ];

  if (summary) {
    input.push({
      role: 'user',
      content: [{ type: 'input_text', text: `Compacted summary of older session context:\n\n${summary}` }],
    });
  }

  if (recentTranscript) {
    input.push({
      role: 'user',
      content: [{ type: 'input_text', text: `Recent uncompressed session transcript:\n\n${recentTranscript}` }],
    });
  }

  input.push(buildInputMessage(pendingMessage || 'The session has been compacted. Briefly acknowledge that compaction is complete and wait for the next user request.'));

  const request = {
    ...baseRequest,
    input,
    store: true,
    previous_response_id: undefined,
  };

  let response = await openai.responses.create(request);
  response = await handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage);
  return { response, summary, recentCount: recentEntries.length, summarizedCount: summaryEntries.length };
}

export async function handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage) {
  let current = response;
  for (;;) {
    if (onResponseUsage) onResponseUsage(extractUsage(current));
    const calls = (current?.output ?? []).filter(isFunctionCall);
    if (calls.length === 0) return current;

    const outputs = [];
    for (const call of calls) {
      const output = await runToolCall(call, cwd);
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
