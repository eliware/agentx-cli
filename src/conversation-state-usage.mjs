export function normalizeUsage(usage = {}) {
  return {
    inputTokens: Number(usage?.inputTokens ?? 0),
    cachedTokens: Number(usage?.cachedTokens ?? 0),
    outputTokens: Number(usage?.outputTokens ?? 0),
    turns: Number(usage?.turns ?? 0),
  };
}
