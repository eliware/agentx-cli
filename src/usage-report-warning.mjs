export const JUMBO_WARNING = "\u001b[91mLong-context pricing applied\u001b[0m";

export function addLongContextWarning(report, pricing) {
  if (pricing.long_context) report.warning = JUMBO_WARNING;
  return report;
}
