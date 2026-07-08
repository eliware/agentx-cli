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

function normalizePendingToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls.map(normalizePendingToolCall).filter(Boolean);
}

function normalizeSessionState(state) {
  return {
    response_id: String(state?.response_id ?? ''),
    usage: normalizeUsage(state?.usage),
    last_user_message: String(state?.last_user_message ?? ''),
    last_assistant_message: String(state?.last_assistant_message ?? ''),
    pending_cli_transcript: String(state?.pending_cli_transcript ?? ''),
    pending_tool_calls: normalizePendingToolCalls(state?.pending_tool_calls),
    pending_response_usage: state?.pending_response_usage ? normalizeUsage(state.pending_response_usage) : null,
  };
}

export async function persistResponseState(statePath, state) {
  await writeText(statePath, `${JSON.stringify(normalizeSessionState(state), null, 2)}\n`);
}

export async function clearSession(statePath) {
  await deleteOptional(statePath);
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
