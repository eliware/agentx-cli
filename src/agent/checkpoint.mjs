import { persistResponseState, readSessionState } from '../session-state.mjs';

// Kept as a compatibility entry point; the canonical implementation lives in session-state.
export async function cleanupStaleOneShotStates(...args) {
  const sessionState = await import('../session-state.mjs');
  await sessionState.cleanupStaleOneShotStates?.(...args);
}

export function createPendingResponse(savedState) { return { id: String(savedState?.response_id ?? ''), output: Array.isArray(savedState?.pending_tool_calls) ? savedState.pending_tool_calls : [] }; }

export function getToolCallId(call) { return String(call?.call_id || call?.id || '').trim(); }

export async function readLatestCheckpoint(checkpointPath, fallbackStatePath) {
  const checkpoint = await readSessionState(checkpointPath);
  if (checkpoint?.response_id) return checkpoint;
  const state = await readSessionState(fallbackStatePath);
  const entry = state?.history?.at(-1);
  return entry?.response_id ? { ...entry, pending_cli_transcript: '', pending_tool_calls: [], history: [entry] } : null;
}

export async function persistCheckpoint(checkpointPath, state) {
  await persistResponseState(checkpointPath, {
    response_id: state?.response_id, usage: state?.usage, last_user_message: state?.last_user_message,
    last_assistant_message: state?.last_assistant_message, pending_cli_transcript: '', pending_tool_calls: [], history: state?.history,
  });
}
