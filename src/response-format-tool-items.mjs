import { compactTranscriptJson, shellOutputPreview } from "./response-transcript-compaction.mjs";

export function formatToolTranscript(item) {
  if (item.type === "function_call")
    return `assistant tool call: ${item.name || "function"}(${item.arguments || item.input || ""})`;
  if (item.type === "shell_call")
    return `assistant shell call: ${compactTranscriptJson({ call_id: item.call_id, action: item.action, status: item.status })}`;
  if (item.type === "function_call_output") return `tool output: ${item.output ?? ""}`;
  if (item.type === "shell_call_output")
    return `tool output shell_call_output: ${compactTranscriptJson({ call_id: item.call_id, max_output_length: item.max_output_length, status: item.status, output: shellOutputPreview(item) })}`;
  if (item.type?.endsWith?.("_call"))
    return `assistant ${item.type}: ${compactTranscriptJson(item)}`;
  if (item.type?.endsWith?.("_call_output"))
    return `tool output ${item.type}: ${compactTranscriptJson(item)}`;
  return undefined;
}
