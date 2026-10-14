import { formatMoney, formatTokenCount } from "./usage-format.mjs";
import { DEFAULT_MODEL, getUsageCostBreakdown } from "./usage-cost.mjs";

function formatCost(tokens, cost) {
  return `${formatTokenCount(tokens)} (${formatMoney(cost)})`;
}

export function buildUsageReport(
  {
    inputTokens = 0,
    cachedTokens = 0,
    cacheWriteTokens = 0,
    outputTokens = 0,
    reasoningTokens = 0,
    model = DEFAULT_MODEL,
  } = {},
  includeReasoning = true,
) {
  const pricing = getUsageCostBreakdown({
    inputTokens: inputTokens + cachedTokens + cacheWriteTokens,
    cachedTokens,
    cacheWriteTokens,
    outputTokens,
    model,
  });
  return {
    pricing,
    report: {
      in: formatCost(inputTokens, pricing.uncached_input_cost_usd),
      cache: formatCost(pricing.cached_tokens, pricing.cached_input_cost_usd),
      ...(pricing.cache_write_tokens
        ? { write: formatCost(pricing.cache_write_tokens, pricing.cache_write_cost_usd) }
        : {}),
      out: formatCost(pricing.output_tokens, pricing.output_cost_usd),
      ...(includeReasoning && reasoningTokens
        ? { reasoning: formatTokenCount(reasoningTokens) }
        : {}),
    },
  };
}
