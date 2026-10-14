export function parseWorkerArguments(call) {
  const raw = call?.arguments ?? call?.input ?? "{}";
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function parseWorkerIds(args) {
  return Array.isArray(args?.agent_ids)
    ? args.agent_ids.filter((id) => typeof id === "string" && id.trim()).slice(0, 10)
    : [];
}
