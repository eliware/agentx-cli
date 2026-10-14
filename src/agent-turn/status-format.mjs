import { normalizeStatusValue } from "./status-value-format.mjs";

export function formatElapsedStatus(elapsedMs) {
  const totalSeconds = Math.max(0, Math.round(Number(elapsedMs ?? 0) / 1000));
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }
  return `${totalSeconds}s`;
}

export function formatTransactionCompletionMessage(summary) {
  const obj = {};
  if (summary?.time !== undefined && summary.time !== "") {
    obj.time = String(summary.time);
  }
  const reasoning = normalizeStatusValue(summary?.reasoning);
  if (reasoning) obj.reasoning = reasoning;
  const writing = normalizeStatusValue(summary?.writing);
  if (writing) obj.writing = writing;
  const executing = normalizeStatusValue(summary?.executing);
  if (executing) obj.executing = executing;
  return JSON.stringify(obj);
}
