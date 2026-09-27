export function exitSessionWithSummary({
  noUsage,
  usage,
  model,
  leadingNewline = false,
  readline,
  printUsageReport,
  exit = process.exit,
}) {
  if (!noUsage) printUsageReport(usage, { leadingNewline, model });
  readline?.close?.();
  exit(0);
}
