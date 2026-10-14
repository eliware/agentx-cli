const workerFunctionNames = new Set(["spawn_agent", "agent_status", "cancel_agent"]);

export function isParallelWorkerFunctionCall(call) {
  return call?.type === "function_call" && workerFunctionNames.has(call.name);
}

export function validateParallelWorkerCall(call, cwd) {
  if (!call || typeof call !== "object" || Array.isArray(call))
    return { error: "invalid worker function call" };
  if (typeof cwd !== "string" || !cwd.trim()) return { error: "invalid working directory" };
  return null;
}

export function unsupportedParallelWorkerCall(call) {
  return { error: `unsupported worker function ${call.name || ""}` };
}
