function normalizeShellOutput(call, output) {
  if (output && typeof output === "object" && output.type === "shell_call_output") {
    return { ...output, call_id: output.call_id || call?.call_id || call?.id || "" };
  }
  throw new TypeError("shell_call must return shell_call_output");
}

function normalizeFunctionOutput(call, output) {
  const callId = call?.call_id || call?.id || "";
  const text = typeof output === "string" ? output : output == null ? "" : JSON.stringify(output);
  return { type: "function_call_output", call_id: callId, output: text };
}

export function toolOutputForCall(call, output) {
  if (call?.type === "shell_call") return normalizeShellOutput(call, output);
  if (call?.type === "function_call") return normalizeFunctionOutput(call, output);
  return {
    type: "function_call_output",
    call_id: call?.call_id || "",
    output: String(output ?? ""),
  };
}
