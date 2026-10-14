import { formatMoney, formatTokenCount, formatUsageJson } from "./usage-format.mjs";
import { DEFAULT_MODEL, getUsageCostBreakdown } from "./usage-cost.mjs";

export { formatMoney } from "./usage-format.mjs";

const JUMBO_WARNING = "\u001b[91mLong-context pricing applied\u001b[0m";

function formatCost(tokens, cost) {
  return `${formatTokenCount(tokens)} (${formatMoney(cost)})`;
}

function makeReport(
  {
    inputTokens = 0,
    cachedTokens = 0,
    cacheWriteTokens = 0,
    outputTokens = 0,
    reasoningTokens = 0,
    model = DEFAULT_MODEL,
  },
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

export function formatUsageReport({ turns = 0, ...fields } = {}) {
  const { pricing, report } = makeReport(fields);
  const average = turns > 0 ? pricing.estimated_cost_usd / turns : 0;
  Object.assign(report, {
    turns: String(turns),
    avg: formatMoney(average),
    total: formatMoney(pricing.estimated_cost_usd),
  });
  if (pricing.long_context) report.warning = JUMBO_WARNING;
  return formatUsageJson(report);
}

export function formatTurnUsageReport(fields = {}) {
  const { pricing, report } = makeReport(fields);
  report.total = formatMoney(pricing.estimated_cost_usd);
  if (pricing.long_context) report.warning = JUMBO_WARNING;
  return formatUsageJson(report);
}

export function formatTurnUsage(fields = {}) {
  return formatUsageReport({ ...fields, turns: 1 });
}

export const usageInternals = { DEFAULT_MODEL, JUMBO_WARNING };
