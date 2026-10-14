export function createSessionUsageCallbacks({ getSessionUsage, addUsageTotals }) {
  const onResponseUsage = (tokens, { skipIncrement = false } = {}) => {
    const totals = getSessionUsage();
    if (!skipIncrement) {
      addUsageTotals(totals, tokens);
      totals.turns += 1;
    }
    return totals;
  };
  const onWorkerUsage = (usage) => {
    const totals = getSessionUsage();
    addUsageTotals(totals, usage);
    totals.turns += usage.turns || 0;
  };
  return { onResponseUsage, onWorkerUsage };
}
