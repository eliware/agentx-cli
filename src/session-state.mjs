import { deleteOptional, readOptionalText, writeText } from './runtime.mjs';

function normalizeUsage(usage = {}) {
  return {
    inputTokens: Number(usage.inputTokens ?? 0),
    cachedTokens: Number(usage.cachedTokens ?? 0),
    outputTokens: Number(usage.outputTokens ?? 0),
    turns: Number(usage.turns ?? 0),
  };
}

function normalizePendingToolCall(call) {
  if (!call || typeof call !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(call));
  } catch {
    return {
      type: String(call.type ?? 'function_call'),
      name: call.name == null ? undefined : String(call.name),
      call_id: String(call.call_id ?? call.id ?? ''),
      input: call.input == null ? undefined : String(call.input),
      arguments: call.arguments == null ? undefined : String(call.arguments),
    };
  }
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    response_id: String(entry.response_id ?? ''),
    timestamp: String(entry.timestamp ?? ''),
    user_preview: String(entry.user_preview ?? '').slice(0, 20),
    assistant_preview: String(entry.assistant_preview ?? '').slice(0, 20),
    usage: normalizeUsage(entry.usage),
    last_user_message: String(entry.last_user_message ?? ''),
    last_assistant_message: String(entry.last_assistant_message ?? ''),
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map(normalizeHistoryEntry).filter((entry) => entry?.response_id).slice(-20);
}

function normalizePendingToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls.map(normalizePendingToolCall).filter(Boolean);
}

function normalizeExecutionJournal(records) {
  if (!Array.isArray(records)) return [];
  return records.filter((record) => record && typeof record === 'object').map((record) => ({
    identity: String(record.identity ?? ''),
    status: String(record.status ?? 'pending'),
    response_id: String(record.response_id ?? ''),
    updated_at: String(record.updated_at ?? ''),
  })).filter((record) => record.identity);
}

function normalizeSessionState(state) {
  const normalized = {
    response_id: String(state?.response_id ?? ''),
    usage: normalizeUsage(state?.usage),
    last_user_message: String(state?.last_user_message ?? ''),
    last_assistant_message: String(state?.last_assistant_message ?? ''),
    pending_cli_transcript: String(state?.pending_cli_transcript ?? ''),
    pending_tool_calls: normalizePendingToolCalls(state?.pending_tool_calls),
  };
  if (Object.prototype.hasOwnProperty.call(state || {}, 'execution_journal')) normalized.execution_journal = normalizeExecutionJournal(state.execution_journal);
  if (Object.prototype.hasOwnProperty.call(state || {}, 'history')) normalized.history = normalizeHistory(state.history);
  if (Object.prototype.hasOwnProperty.call(state || {}, 'rollback_backup')) normalized.rollback_backup = normalizeHistory(state.rollback_backup);
  if (Object.prototype.hasOwnProperty.call(state || {}, 'failed_response')) normalized.failed_response = Boolean(state.failed_response);
  return normalized;
}

export async function persistResponseState(statePath, state) {
  await writeText(statePath, `${JSON.stringify(normalizeSessionState(state), null, 2)}\n`);
}

export async function clearSession(statePath) {
  await deleteOptional(statePath);
}

export async function readLatestCheckpoint(checkpointPath, fallbackStatePath = '') {
  const checkpoint = await readSessionState(checkpointPath);
  if (checkpoint?.response_id) return checkpoint;
  if (!fallbackStatePath) return null;
  const state = await readSessionState(fallbackStatePath);
  const entry = state?.history?.at(-1);
  return entry?.response_id ? {
    response_id: entry.response_id,
    usage: entry.usage,
    last_user_message: entry.last_user_message,
    last_assistant_message: entry.last_assistant_message,
    pending_cli_transcript: '',
    pending_tool_calls: [],
    history: [entry],
  } : null;
}

export async function persistCheckpoint(checkpointPath, state) {
  await persistResponseState(checkpointPath, {
    response_id: state?.response_id,
    usage: state?.usage,
    last_user_message: state?.last_user_message,
    last_assistant_message: state?.last_assistant_message,
    pending_cli_transcript: '',
    pending_tool_calls: [],
    history: state?.history,
  });
}

export async function readSessionState(statePath) {
  const raw = await readOptionalText(statePath);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return normalizeSessionState(parsed);
  } catch { }
  return normalizeSessionState({ response_id: raw.trim() || '', usage: {} });
}
