import { formatMoney } from "./usage-format.mjs";
import { buildUsageReport } from "./usage-report-builder.mjs";
import { addLongContextWarning } from "./usage-report-warning.mjs";

export function buildTurnUsageReport(fields = {}) {
  const { pricing, report } = buildUsageReport(fields);
  report.total = formatMoney(pricing.estimated_cost_usd);
  return addLongContextWarning(report, pricing);
}
