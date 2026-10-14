import { formatTurnUsage, formatUsageReport, formatTurnUsageReport } from "./usage.mjs";
import { extractTextFromResponse, isFunctionCall } from "./response-parts.mjs";
import { extractUsage } from "./response-usage.mjs";
import { addTurn, addUsageTotals, createUsageTotals } from "./usage-totals.mjs";

export { extractTextFromResponse, isFunctionCall };
export { extractUsage, createUsageTotals, addUsageTotals, addTurn };
export { formatUsageReport, formatTurnUsageReport };

export function formatUsageSummary(response) {
  return formatTurnUsage({ ...extractUsage(response), model: response?.model });
}
