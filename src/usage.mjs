import { formatUsageJson } from "./usage-format.mjs";
import {
  buildCumulativeUsageReport,
  buildTurnUsageReport,
  usagePolicyInternals,
} from "./usage-report-policy.mjs";

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

export const usageInternals = usagePolicyInternals;
