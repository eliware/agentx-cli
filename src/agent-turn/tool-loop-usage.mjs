import { writeTerminal } from "../terminal-output.mjs";
import { createUsageTotals, extractUsage } from "../response.mjs";
import { formatUsageMessage } from "../shell-display.mjs";
import { formatTurnUsageReport, formatUsageReport } from "../usage.mjs";

export function collectToolLoopUsage(
  response,
  { shouldReport = true, onResponseUsage, callbackOptions } = {},
) {
  const usage = shouldReport ? extractUsage(response) : createUsageTotals();
  let cumulativeUsage = null;
  if (shouldReport && onResponseUsage) {
    cumulativeUsage =
      callbackOptions === undefined
        ? onResponseUsage(usage)
        : onResponseUsage(usage, callbackOptions);
  }
  return { usage, cumulativeUsage };
}

export function writeToolLoopUsage({ usage, cumulativeUsage, model, suppressOutput = false } = {}) {
  if (suppressOutput) return;

  writeTerminal(`${formatUsageMessage(formatTurnUsageReport({ ...usage, model }))}\n`);
  if (cumulativeUsage) {
    writeTerminal(`${formatUsageMessage(formatUsageReport({ ...cumulativeUsage, model }))}\n`);
  }
}
