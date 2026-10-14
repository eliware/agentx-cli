import { formatContentTranscript } from "../response-format-content.mjs";
import { compactTranscriptJson } from "../response-transcript-compaction.mjs";
import { formatToolTranscript } from "../response-format-tool-items.mjs";

export function responseItemToTranscript(item) {
  if (!item || item.role === "developer" || item.role === "system") return "";
  const contentTranscript = formatContentTranscript(item);
  if (contentTranscript !== undefined) return contentTranscript;
  const toolTranscript = formatToolTranscript(item);
  if (toolTranscript !== undefined) return toolTranscript;
  return `${item.role || item.type || "item"}: ${compactTranscriptJson(item)}`;
}
