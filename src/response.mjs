import { formatTurnUsage, formatUsageReport, formatTurnUsageReport } from './usage.mjs';
import { extractTextFromResponse, isFunctionCall, extractUsage, createUsageTotals, addUsageTotals, addTurn } from './response-parts.mjs';

export { extractTextFromResponse, isFunctionCall, extractUsage, createUsageTotals, addUsageTotals, addTurn };
export { formatUsageReport, formatTurnUsageReport };

export function formatUsageSummary(response) {
  return formatTurnUsage({ ...extractUsage(response), model: response?.model });
}
