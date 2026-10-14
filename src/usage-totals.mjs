export function createUsageTotals() {
  return { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 };
}

export function addUsageTotals(totals, usage) {
  totals.inputTokens += Number(usage?.inputTokens ?? 0);
  totals.cachedTokens += Number(usage?.cachedTokens ?? 0);
  if (usage?.cacheWriteTokens !== undefined)
    totals.cacheWriteTokens = (totals.cacheWriteTokens ?? 0) + Number(usage.cacheWriteTokens);
  totals.outputTokens += Number(usage?.outputTokens ?? 0);
  if (usage?.reasoningTokens !== undefined)
    totals.reasoningTokens = (totals.reasoningTokens ?? 0) + Number(usage.reasoningTokens);
  return totals;
}

export function addTurn(totals) {
  totals.turns += 1;
  return totals;
}
