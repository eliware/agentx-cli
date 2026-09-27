function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function toolCallIdentity(call, cwd = "") {
  const callId = call?.call_id || call?.id;
  if (callId) return `id:${callId}`;
  return `hash:${JSON.stringify(
    stableValue({
      type: call?.type || "",
      name: call?.name || "",
      cwd: cwd || "",
      action: call?.action || {},
      arguments: call?.arguments ?? call?.input ?? "",
    }),
  )}`;
}

export function dedupeToolCalls(calls, cwd = "") {
  const seen = new Set();
  return calls.filter((call) => {
    const identity = toolCallIdentity(call, cwd);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function dedupeToolOutputs(outputs) {
  const seen = new Set();
  return outputs.filter((output) => {
    const callId = String(output?.call_id ?? "").trim();
    const identity = callId || JSON.stringify(stableValue(output));
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
