export function createSessionWorkerUsageCallback({ getSessionUsage, addUsageTotals }) {
  return (usage) => {
    const totals = getSessionUsage();
    addUsageTotals(totals, usage);
    totals.turns += usage.turns || 0;
  };
}
