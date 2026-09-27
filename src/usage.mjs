import {
  calculateUsageCostNanoDollars,
  isJumboPrompt,
  ratesForUsage,
  usagePricingInternals,
} from "./usage-pricing.mjs";
import { numericValue } from "./usage-normalization.mjs";

const { DEFAULT_MODEL } = usagePricingInternals;

const NANO_DOLLARS_PER_DISPLAY_UNIT = 1_000_000n;
const JUMBO_WARNING = "\u001b[91mLong-context pricing applied\u001b[0m";
export function formatMoney(value) {
  const nanoDollars =
    typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value ?? 0) * 1_000_000_000));
  const roundedThousandths =
    nanoDollars >= 0n
      ? (nanoDollars + NANO_DOLLARS_PER_DISPLAY_UNIT / 2n) / NANO_DOLLARS_PER_DISPLAY_UNIT
      : -((-nanoDollars + NANO_DOLLARS_PER_DISPLAY_UNIT / 2n) / NANO_DOLLARS_PER_DISPLAY_UNIT);
  const sign = roundedThousandths < 0n ? "-" : "";
  const absolute = roundedThousandths < 0n ? -roundedThousandths : roundedThousandths;
  const whole = absolute / 1000n;
  const fractional = (absolute % 1000n).toString().padStart(3, "0");
  return `$${sign}${whole.toString()}.${fractional}`;
}

function formatTokenCount(tokens) {
  return numericValue(tokens).toLocaleString("en-US");
}
function formatTokenCost(tokens, rateNanoDollarsPerToken) {
  return `${formatTokenCount(tokens)} (${formatMoney(BigInt(Math.trunc(numericValue(tokens))) * rateNanoDollarsPerToken)})`;
}
function formatUsageJson(fields) {
  return JSON.stringify(fields).replaceAll("\\u001b", "\u001b");
}

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
