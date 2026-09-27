import { persistResponseState, readSessionState } from "./conversation-state.mjs";

export async function readLatestCheckpoint(checkpointPath, fallbackStatePath = "") {
  const checkpoint = await readSessionState(checkpointPath);
  if (checkpoint?.response_id) return checkpoint;
  if (!fallbackStatePath) return null;
  const state = await readSessionState(fallbackStatePath);
  const entry = state?.history?.at(-1);
  return entry?.response_id
    ? {
        response_id: entry.response_id,
        usage: entry.usage,
        last_user_message: entry.last_user_message,
        last_assistant_message: entry.last_assistant_message,
        pending_cli_transcript: "",
        pending_tool_calls: [],
        history: [entry],
      }
    : null;
}

export async function persistCheckpoint(checkpointPath, state) {
  await persistResponseState(checkpointPath, {
    response_id: state?.response_id,
    usage: state?.usage,
    last_user_message: state?.last_user_message,
    last_assistant_message: state?.last_assistant_message,
    pending_cli_transcript: "",
    pending_tool_calls: [],
    history: state?.history,
  });
}
