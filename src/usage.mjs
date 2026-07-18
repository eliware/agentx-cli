export function normalizeUsage({ inputTokens = 0, cachedTokens = 0, outputTokens = 0 } = {}) {
  const totalInputTokens = Number(inputTokens ?? 0);
  const totalCachedTokens = Number(cachedTokens ?? 0);
  const hiddenInputTokens = Math.max(totalInputTokens - totalCachedTokens, 0);
  return {
    inputTokens: hiddenInputTokens,
    cachedTokens: totalCachedTokens,
    outputTokens: Number(outputTokens ?? 0),
  };
}

const INPUT_NANO_DOLLARS_PER_TOKEN = 1_000n;
const CACHED_NANO_DOLLARS_PER_TOKEN = 100n;
const OUTPUT_NANO_DOLLARS_PER_TOKEN = 6_000n;
const NANO_DOLLARS_PER_DISPLAY_UNIT = 1_000_000n;

function toTokenCount(value) {
  return BigInt(Math.trunc(Number(value ?? 0)));
}

export function calculateUsageCostNanoDollars({ inputTokens, cachedTokens, outputTokens }) {
  return (toTokenCount(inputTokens) * INPUT_NANO_DOLLARS_PER_TOKEN)
    + (toTokenCount(cachedTokens) * CACHED_NANO_DOLLARS_PER_TOKEN)
    + (toTokenCount(outputTokens) * OUTPUT_NANO_DOLLARS_PER_TOKEN);
}

export function calculateUsageCost({ inputTokens, cachedTokens, outputTokens }) {
  return Number(calculateUsageCostNanoDollars({ inputTokens, cachedTokens, outputTokens })) / 1_000_000_000;
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

function formatTokenCount(tokens) {
  return Number(tokens).toLocaleString('en-US');
}

function formatTokenCost(tokens, rateNanoDollarsPerToken) {
  return `${formatTokenCount(tokens)} (${formatMoney(BigInt(Math.trunc(Number(tokens ?? 0))) * rateNanoDollarsPerToken)})`;
}

function formatUsageJson(fields) {
  return JSON.stringify(fields);
}

export function formatUsageReport({ inputTokens, cachedTokens, outputTokens, turns }) {
  const totalCost = calculateUsageCostNanoDollars({ inputTokens, cachedTokens, outputTokens });
  const avgCostPerTurn = turns > 0 ? totalCost / BigInt(turns) : 0n;
  return formatUsageJson({
    in: formatTokenCost(inputTokens, INPUT_NANO_DOLLARS_PER_TOKEN),
    cache: formatTokenCost(cachedTokens, CACHED_NANO_DOLLARS_PER_TOKEN),
    out: formatTokenCost(outputTokens, OUTPUT_NANO_DOLLARS_PER_TOKEN),
    turns: String(turns),
    avg: formatMoney(avgCostPerTurn),
    total: formatMoney(totalCost),
  });
}

export function formatTurnUsageReport({ inputTokens, cachedTokens, outputTokens }) {
  const totalCost = calculateUsageCostNanoDollars({ inputTokens, cachedTokens, outputTokens });
  return formatUsageJson({
    in: formatTokenCost(inputTokens, INPUT_NANO_DOLLARS_PER_TOKEN),
    cache: formatTokenCost(cachedTokens, CACHED_NANO_DOLLARS_PER_TOKEN),
    out: formatTokenCost(outputTokens, OUTPUT_NANO_DOLLARS_PER_TOKEN),
    total: formatMoney(totalCost),
  });
}

export function formatTurnUsage({ inputTokens, cachedTokens, outputTokens }) {
  return formatUsageReport({ inputTokens, cachedTokens, outputTokens, turns: 1 });
}
