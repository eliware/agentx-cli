export function formatElapsedStatus(elapsedMs) {
  const totalSeconds = Math.max(0, Math.round(Number(elapsedMs ?? 0) / 1000));
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }
  return `${totalSeconds}s`;
}

function stripStatusValue(value) {
  if (value && typeof value === "object" && "value" in value) return String(value.value ?? "");
  if (typeof value !== "string") return String(value ?? "");
  return stripAnsi(value.replace(/^([a-z]+):\s+/, ""));
}

export function formatTransactionCompletionMessage(summary) {
  const obj = {};
  if (summary?.time !== undefined && summary.time !== "") {
    obj.time = String(summary.time);
  }
  const reasoning = stripStatusValue(summary?.reasoning);
  if (reasoning) obj.reasoning = reasoning;
  const writing = stripStatusValue(summary?.writing);
  if (writing) obj.writing = writing;
  const executing = stripStatusValue(summary?.executing);
  if (executing) obj.executing = executing;
  return JSON.stringify(obj);
}
import stripAnsi from "strip-ansi";
