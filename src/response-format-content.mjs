export function textFromContent(content) {
  if (content == null) return undefined;
  const parts = [];
  for (const part of content) {
    if (part?.text) parts.push(String(part.text));
    else if (part?.type === "input_text" || part?.type === "output_text")
      parts.push(String(part.text ?? ""));
    else if (part?.type === "refusal" && part.refusal) parts.push(`[refusal] ${part.refusal}`);
  }
  return parts.filter(Boolean).join("\n");
}

export function formatContentTranscript(item) {
  if (item.type === "message") {
    const text = textFromContent(item.content);
    return text ? `${item.role || "message"}: ${text}` : "";
  }
  if (item.type === "reasoning") return textFromContent(item.summary) ?? "";
  return undefined;
}
