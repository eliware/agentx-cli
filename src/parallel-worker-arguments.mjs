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

export function normalizeSpawnWorkerArguments(args) {
  const task = typeof args?.task === "string" ? args.task.trim() : "";
  if (!task) return { error: "task must be a non-empty string" };
  const permissions = ["read", "write", "execute"].includes(args?.permissions)
    ? args.permissions
    : "execute";
  return { task, permissions };
}
