import { readdir, stat, unlink } from 'node:fs/promises';
import { path } from '@eliware/common';
import { persistResponseState, readSessionState } from '../session-state.mjs';

export async function cleanupStaleOneShotStates(directory, now = Date.now()) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith('.agentx_responseid.oneshot-')) continue;
    const filePath = path(directory, entry.name);
    /* istanbul ignore next -- unlink races are tolerated defensively. */
    if (now - (await stat(filePath)).mtimeMs >= 60 * 60 * 1000) await unlink(filePath).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
  }
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
