const SHELL_OUTPUT_PREVIEW = 120;

export function compactTranscriptJson(value) {
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

export function shellOutputPreview(item) {
  const chunks = Array.isArray(item?.output) ? item.output : [];
  return chunks.map((chunk) => ({
    stdout: String(chunk?.stdout ?? "").slice(0, SHELL_OUTPUT_PREVIEW),
    stderr: String(chunk?.stderr ?? "").slice(0, SHELL_OUTPUT_PREVIEW),
    outcome: chunk?.outcome ?? null,
  }));
}
