import { formatUsageJson } from "./usage-format.mjs";
import { DEFAULT_MODEL } from "./usage-cost.mjs";
import { buildCumulativeUsageReport } from "./usage-cumulative-report-policy.mjs";
import { buildTurnUsageReport } from "./usage-turn-report-policy.mjs";
import { JUMBO_WARNING } from "./usage-report-warning.mjs";

export { formatMoney } from "./usage-format.mjs";

export function formatUsageReport(fields = {}) {
  return formatUsageJson(buildCumulativeUsageReport(fields));
}

export function formatTurnUsageReport(fields = {}) {
  return formatUsageJson(buildTurnUsageReport(fields));
}

export function formatTurnUsage(fields = {}) {
  return formatUsageReport({ ...fields, turns: 1 });
}

export const usageInternals = { DEFAULT_MODEL, JUMBO_WARNING };
