import {
  calculateUsageCostNanoDollars,
  isJumboPrompt,
  ratesForUsage,
  usagePricingInternals,
} from "./usage-pricing.mjs";
import {
  formatMoney,
  formatTokenCost,
  formatTokenCount,
  formatUsageJson,
} from "./usage-format.mjs";

export { formatMoney } from "./usage-format.mjs";

const { DEFAULT_MODEL } = usagePricingInternals;

const JUMBO_WARNING = "\u001b[91mLong-context pricing applied\u001b[0m";

export function formatUsageReport({
  inputTokens = 0,
  cachedTokens = 0,
  cacheWriteTokens = 0,
  outputTokens = 0,
  reasoningTokens = 0,
  turns = 0,
  model = DEFAULT_MODEL,
} = {}) {
  const rates = ratesForUsage({ inputTokens, cachedTokens, model });
  const totalCost = calculateUsageCostNanoDollars({
    inputTokens,
    cachedTokens,
    cacheWriteTokens,
    outputTokens,
    model,
  });
  const avgCostPerTurn = turns > 0 ? totalCost / BigInt(turns) : 0n;
  const report = {
    in: formatTokenCost(inputTokens, rates.input),
    cache: formatTokenCost(cachedTokens, rates.cached),
    ...(cacheWriteTokens ? { write: formatTokenCost(cacheWriteTokens, rates.cacheWrite) } : {}),
    out: formatTokenCost(outputTokens, rates.output),
    ...(reasoningTokens ? { reasoning: formatTokenCount(reasoningTokens) } : {}),
    turns: String(turns),
    avg: formatMoney(avgCostPerTurn),
    total: formatMoney(totalCost),
  };
  if (isJumboPrompt({ inputTokens, cachedTokens })) report.warning = JUMBO_WARNING;
  return formatUsageJson(report);
}

export function formatTurnUsageReport({
  inputTokens = 0,
  cachedTokens = 0,
  cacheWriteTokens = 0,
  outputTokens = 0,
  reasoningTokens = 0,
  model = DEFAULT_MODEL,
} = {}) {
  const rates = ratesForUsage({ inputTokens, cachedTokens, model });
  const totalCost = calculateUsageCostNanoDollars({
    inputTokens,
    cachedTokens,
    cacheWriteTokens,
    outputTokens,
    model,
  });
  const report = {
    in: formatTokenCost(inputTokens, rates.input),
    cache: formatTokenCost(cachedTokens, rates.cached),
    ...(cacheWriteTokens ? { write: formatTokenCost(cacheWriteTokens, rates.cacheWrite) } : {}),
    out: formatTokenCost(outputTokens, rates.output),
    ...(reasoningTokens ? { reasoning: formatTokenCount(reasoningTokens) } : {}),
    total: formatMoney(totalCost),
  };
  if (isJumboPrompt({ inputTokens, cachedTokens })) report.warning = JUMBO_WARNING;
  return formatUsageJson(report);
}

export function formatTurnUsage(fields = {}) {
  return formatUsageReport({ ...fields, turns: 1 });
}

export const usageInternals = {
  JUMBO_WARNING,
  ...usagePricingInternals,
};
