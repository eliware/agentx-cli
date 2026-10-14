import { normalizeUsage } from "./conversation-state-usage.mjs";

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    response_id: String(entry.response_id ?? ""),
    timestamp: String(entry.timestamp ?? ""),
    user_preview: String(entry.user_preview ?? "").slice(0, 20),
    assistant_preview: String(entry.assistant_preview ?? "").slice(0, 20),
    usage: normalizeUsage(entry.usage),
    last_user_message: String(entry.last_user_message ?? ""),
    last_assistant_message: String(entry.last_assistant_message ?? ""),
  };
}

export function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map(normalizeHistoryEntry)
    .filter((entry) => entry?.response_id)
    .slice(-20);
}
