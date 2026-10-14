import { formatMoney } from "./usage-format.mjs";
import { buildUsageReport } from "./usage-report-builder.mjs";
import { addLongContextWarning } from "./usage-report-warning.mjs";

export function buildCumulativeUsageReport({ turns = 0, ...fields } = {}) {
  const { pricing, report } = buildUsageReport(fields);
  const average = turns > 0 ? pricing.estimated_cost_usd / turns : 0;
  Object.assign(report, {
    turns: String(turns),
    avg: formatMoney(average),
    total: formatMoney(pricing.estimated_cost_usd),
  });
  return addLongContextWarning(report, pricing);
}
