import { normalizeUsage } from "./usage-normalization.mjs";

export function extractUsage(response) {
  const usage = response?.usage ?? {};
  return normalizeUsage({
    inputTokens: Number(usage.input_tokens ?? 0),
    cachedTokens: Number(usage.input_tokens_details?.cached_tokens ?? 0),
    cacheWriteTokens: Number(usage.input_tokens_details?.cache_write_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens ?? 0),
  });
}
