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

export function calculateUsageCost({ inputTokens, cachedTokens, outputTokens }) {
  const inputRate = 0.75 / 1_000_000;
  const cachedRate = 0.075 / 1_000_000;
  const outputRate = 4.5 / 1_000_000;

  return (inputTokens * inputRate) + (cachedTokens * cachedRate) + (outputTokens * outputRate);
}

function formatMoney(value) {
  return `$${value.toFixed(3)}`;
}

function formatTokenCount(tokens) {
  return Number(tokens).toLocaleString('en-US');
}

function formatTokenCost(tokens, rate) {
  return `${formatTokenCount(tokens)} (${formatMoney(tokens * rate)})`;
}

function formatUsageJson(fields) {
  return JSON.stringify(fields);
}

export function formatUsageReport({ inputTokens, cachedTokens, outputTokens, turns }) {
  const inputRate = 0.75 / 1_000_000;
  const cachedRate = 0.075 / 1_000_000;
  const outputRate = 4.5 / 1_000_000;
  const totalCost = calculateUsageCost({ inputTokens, cachedTokens, outputTokens });
  const avgCostPerTurn = turns > 0 ? totalCost / turns : 0;
  return formatUsageJson({
    in: formatTokenCost(inputTokens, inputRate),
    cache: formatTokenCost(cachedTokens, cachedRate),
    out: formatTokenCost(outputTokens, outputRate),
    sum: formatMoney(totalCost),
    msgs: String(turns),
    avg: formatMoney(avgCostPerTurn),
  });
}

export function formatTurnUsageReport({ inputTokens, cachedTokens, outputTokens }) {
  const inputRate = 0.75 / 1_000_000;
  const cachedRate = 0.075 / 1_000_000;
  const outputRate = 4.5 / 1_000_000;
  const totalCost = calculateUsageCost({ inputTokens, cachedTokens, outputTokens });
  return formatUsageJson({
    in: formatTokenCost(inputTokens, inputRate),
    cache: formatTokenCost(cachedTokens, cachedRate),
    out: formatTokenCost(outputTokens, outputRate),
    sum: formatMoney(totalCost),
  });
}

export function formatTurnUsage({ inputTokens, cachedTokens, outputTokens }) {
  return formatUsageReport({ inputTokens, cachedTokens, outputTokens, turns: 1 });
}
