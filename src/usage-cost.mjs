import { API_PRICING, calculateUsageCostBreakdown } from "@eliware/openai";
import { numericValue } from "./usage-normalization.mjs";

export const DEFAULT_MODEL = "gpt-6-luna";
export const AVAILABLE_MODELS = Object.keys(API_PRICING);

export function getUsageCostBreakdown({
  inputTokens = 0,
  cachedTokens = 0,
  cacheWriteTokens = 0,
  outputTokens = 0,
  model = DEFAULT_MODEL,
} = {}) {
  const modelName = API_PRICING[String(model)] ? String(model) : DEFAULT_MODEL;
  const cached = Math.max(0, Math.trunc(numericValue(cachedTokens)));
  const cacheWrite = Math.max(0, Math.trunc(numericValue(cacheWriteTokens)));
  const input = Math.max(cached + cacheWrite, Math.max(0, Math.trunc(numericValue(inputTokens))));
  return calculateUsageCostBreakdown(modelName, {
    input_tokens: input,
    output_tokens: Math.max(0, Math.trunc(numericValue(outputTokens))),
    input_tokens_details: {
      cached_tokens: cached,
      cache_write_tokens: cacheWrite,
    },
  });
}
