import stripAnsiText from "strip-ansi";

export function stripAnsi(value) {
  return stripAnsiText(String(value ?? ""));
}

export function numericValue(value) {
  const parsed = Number(stripAnsi(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeUsage({
  inputTokens = 0,
  cachedTokens = 0,
  cacheWriteTokens = 0,
  outputTokens = 0,
  reasoningTokens = 0,
} = {}) {
  const totalInputTokens = numericValue(inputTokens);
  const totalCachedTokens = numericValue(cachedTokens);
  const hiddenInputTokens = Math.max(totalInputTokens - totalCachedTokens, 0);
  const result = {
    inputTokens: hiddenInputTokens,
    cachedTokens: totalCachedTokens,
    outputTokens: numericValue(outputTokens),
  };
  if (numericValue(cacheWriteTokens) !== 0)
    result.cacheWriteTokens = numericValue(cacheWriteTokens);
  if (numericValue(reasoningTokens) !== 0) result.reasoningTokens = numericValue(reasoningTokens);
  return result;
}
