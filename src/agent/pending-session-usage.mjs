export function createPendingSessionUsage({ getSessionUsage, addUsageTotals }) {
  const onResponseUsage = (tokens, { skipIncrement = false } = {}) => {
    const totals = getSessionUsage();
    if (!skipIncrement) {
      addUsageTotals(totals, tokens);
      totals.turns += 1;
    }
    return totals;
  };
  const onWorkerUsage = (workerUsage) => {
    const totals = getSessionUsage();
    addUsageTotals(totals, workerUsage);
    totals.turns += workerUsage.turns || 0;
  };
  return { onResponseUsage, onWorkerUsage };
}
