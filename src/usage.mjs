const MODEL_PRICING = {
  'gpt-5.6-luna': { input: 1_000n, cached: 100n, output: 6_000n },
  'gpt-5.6-terra': { input: 2_500n, cached: 250n, output: 15_000n },
  'gpt-5.6-sol': { input: 5_000n, cached: 500n, output: 30_000n },
};

const DEFAULT_MODEL = 'gpt-5.6-luna';
const JUMBO_PROMPT_THRESHOLD = 270_000;
const NANO_DOLLARS_PER_DISPLAY_UNIT = 1_000_000n;
const JUMBO_WARNING = '\u001b[91mJumbo prompt pricing applied (2x)\u001b[0m';

export function normalizeUsage({ inputTokens = 0, cachedTokens = 0, outputTokens = 0 } = {}) {
  const totalInputTokens = Number(inputTokens ?? 0);
  const totalCachedTokens = Number(cachedTokens ?? 0);
  const hiddenInputTokens = Math.max(totalInputTokens - totalCachedTokens, 0);
  return { inputTokens: hiddenInputTokens, cachedTokens: totalCachedTokens, outputTokens: Number(outputTokens ?? 0) };
}

export function getModelPricing(model = DEFAULT_MODEL) {
  return MODEL_PRICING[String(model || '').toLowerCase()] || MODEL_PRICING[DEFAULT_MODEL];
}

export function isJumboPrompt({ inputTokens = 0, cachedTokens = 0 } = {}) {
  const hiddenInputTokens = Math.max(Number(inputTokens ?? 0) - Number(cachedTokens ?? 0), 0);
  return hiddenInputTokens >= JUMBO_PROMPT_THRESHOLD;
}

function ratesForUsage({ inputTokens, cachedTokens, model }) {
  const pricing = getModelPricing(model);
  if (!isJumboPrompt({ inputTokens, cachedTokens })) return pricing;
  return { input: pricing.input * 2n, cached: pricing.cached * 2n, output: pricing.output * 2n };
}

function toTokenCount(value) { return BigInt(Math.max(0, Math.trunc(Number(value ?? 0)))); }

export function calculateUsageCostNanoDollars({ inputTokens = 0, cachedTokens = 0, outputTokens = 0, model = DEFAULT_MODEL } = {}) {
  const rates = ratesForUsage({ inputTokens, cachedTokens, model });
  return (toTokenCount(inputTokens) * rates.input)
    + (toTokenCount(cachedTokens) * rates.cached)
    + (toTokenCount(outputTokens) * rates.output);
}

export function calculateUsageCost(fields = {}) {
  return Number(calculateUsageCostNanoDollars(fields)) / 1_000_000_000;
}

export function formatMoney(value) {
  const nanoDollars = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value ?? 0) * 1_000_000_000));
  const roundedThousandths = nanoDollars >= 0n
    ? (nanoDollars + (NANO_DOLLARS_PER_DISPLAY_UNIT / 2n)) / NANO_DOLLARS_PER_DISPLAY_UNIT
    : -(((-nanoDollars) + (NANO_DOLLARS_PER_DISPLAY_UNIT / 2n)) / NANO_DOLLARS_PER_DISPLAY_UNIT);
  const sign = roundedThousandths < 0n ? '-' : '';
  const absolute = roundedThousandths < 0n ? -roundedThousandths : roundedThousandths;
  const whole = absolute / 1000n;
  const fractional = (absolute % 1000n).toString().padStart(3, '0');
  return `$${sign}${whole.toString()}.${fractional}`;
}

function formatTokenCount(tokens) { return Number(tokens).toLocaleString('en-US'); }
function formatTokenCost(tokens, rateNanoDollarsPerToken) {
  return `${formatTokenCount(tokens)} (${formatMoney(BigInt(Math.trunc(Number(tokens ?? 0))) * rateNanoDollarsPerToken)})`;
}
function formatUsageJson(fields) { return JSON.stringify(fields).replaceAll('\\u001b', '\u001b'); }

export function formatUsageReport({ inputTokens = 0, cachedTokens = 0, outputTokens = 0, turns = 0, model = DEFAULT_MODEL } = {}) {
  const rates = ratesForUsage({ inputTokens, cachedTokens, model });
  const totalCost = calculateUsageCostNanoDollars({ inputTokens, cachedTokens, outputTokens, model });
  const avgCostPerTurn = turns > 0 ? totalCost / BigInt(turns) : 0n;
  const report = {
    in: formatTokenCost(inputTokens, rates.input),
    cache: formatTokenCost(cachedTokens, rates.cached),
    out: formatTokenCost(outputTokens, rates.output),
    turns: String(turns), avg: formatMoney(avgCostPerTurn), total: formatMoney(totalCost),
  };
  if (isJumboPrompt({ inputTokens, cachedTokens })) report.warning = JUMBO_WARNING;
  return formatUsageJson(report);
}

export function formatTurnUsageReport({ inputTokens = 0, cachedTokens = 0, outputTokens = 0, model = DEFAULT_MODEL } = {}) {
  const rates = ratesForUsage({ inputTokens, cachedTokens, model });
  const totalCost = calculateUsageCostNanoDollars({ inputTokens, cachedTokens, outputTokens, model });
  const report = {
    in: formatTokenCost(inputTokens, rates.input), cache: formatTokenCost(cachedTokens, rates.cached),
    out: formatTokenCost(outputTokens, rates.output), total: formatMoney(totalCost),
  };
  if (isJumboPrompt({ inputTokens, cachedTokens })) report.warning = JUMBO_WARNING;
  return formatUsageJson(report);
}

export function formatTurnUsage(fields = {}) { return formatUsageReport({ ...fields, turns: 1 }); }

export const usageInternals = { DEFAULT_MODEL, JUMBO_PROMPT_THRESHOLD, JUMBO_WARNING, MODEL_PRICING };
