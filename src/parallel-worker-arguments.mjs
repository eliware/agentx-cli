export function parseWorkerArguments(call) {
  const raw = call?.arguments ?? call?.input ?? "{}";
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
