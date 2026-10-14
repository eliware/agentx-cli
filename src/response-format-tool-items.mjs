const SHELL_OUTPUT_PREVIEW = 120;

function compactJson(value) {
  return JSON.stringify(value, (key, nested) => {
    if (key === "encrypted_content") return "[encrypted reasoning omitted]";
    if (key === "result" && typeof nested === "string" && nested.length > 500)
      return `[large result omitted: ${nested.length} chars]`;
    if (key === "output" && Array.isArray(nested))
      return nested.map((chunk) => {
        if (!chunk || typeof chunk !== "object") return chunk;
        return {
          stdout: String(chunk.stdout ?? "").slice(0, SHELL_OUTPUT_PREVIEW),
          stderr: String(chunk.stderr ?? "").slice(0, SHELL_OUTPUT_PREVIEW),
          outcome: chunk.outcome,
        };
      });
    return nested;
  });
}

function shellOutputPreview(item) {
  const chunks = Array.isArray(item?.output) ? item.output : [];
  return chunks.map((chunk) => ({
    stdout: String(chunk?.stdout ?? "").slice(0, SHELL_OUTPUT_PREVIEW),
    stderr: String(chunk?.stderr ?? "").slice(0, SHELL_OUTPUT_PREVIEW),
    outcome: chunk?.outcome ?? null,
  }));
}

export function formatToolTranscript(item) {
  if (item.type === "function_call")
    return `assistant tool call: ${item.name || "function"}(${item.arguments || item.input || ""})`;
  if (item.type === "shell_call")
    return `assistant shell call: ${compactJson({ call_id: item.call_id, action: item.action, status: item.status })}`;
  if (item.type === "function_call_output") return `tool output: ${item.output ?? ""}`;
  if (item.type === "shell_call_output")
    return `tool output shell_call_output: ${compactJson({ call_id: item.call_id, max_output_length: item.max_output_length, status: item.status, output: shellOutputPreview(item) })}`;
  if (item.type?.endsWith?.("_call")) return `assistant ${item.type}: ${compactJson(item)}`;
  if (item.type?.endsWith?.("_call_output"))
    return `tool output ${item.type}: ${compactJson(item)}`;
  return undefined;
}

export function compactTranscriptJson(value) {
  return compactJson(value);
}
