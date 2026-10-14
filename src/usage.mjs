import { formatMoney, formatUsageJson } from "./usage-format.mjs";
import { DEFAULT_MODEL } from "./usage-cost.mjs";
import { buildUsageReport } from "./usage-report-builder.mjs";

export { formatMoney } from "./usage-format.mjs";

const JUMBO_WARNING = "\u001b[91mLong-context pricing applied\u001b[0m";

export function formatUsageReport({ turns = 0, ...fields } = {}) {
  const { pricing, report } = buildUsageReport(fields);
  const average = turns > 0 ? pricing.estimated_cost_usd / turns : 0;
  Object.assign(report, {
    turns: String(turns),
    avg: formatMoney(average),
    total: formatMoney(pricing.estimated_cost_usd),
  });
  if (pricing.long_context) report.warning = JUMBO_WARNING;
  return formatUsageJson(report);
}

export function formatTurnUsageReport(fields = {}) {
  const { pricing, report } = buildUsageReport(fields);
  report.total = formatMoney(pricing.estimated_cost_usd);
  if (pricing.long_context) report.warning = JUMBO_WARNING;
  return formatUsageJson(report);
}

export function formatTurnUsage(fields = {}) {
  return formatUsageReport({ ...fields, turns: 1 });
}

export const usageInternals = { DEFAULT_MODEL, JUMBO_WARNING };
