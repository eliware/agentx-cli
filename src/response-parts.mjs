export function extractTextFromResponse(response) {
  const parts = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

export function isFunctionCall(item) {
  return item?.type === "function_call";
}
