export function reportSessionWorkerUsage({ worker, noUsage, model, formatUsageReport, write }) {
  if (!worker?.usage || noUsage) return;
  const usage = formatUsageReport({ ...worker.usage, model });
  write(`\u001b[38;5;33m${usage}\u001b[0m\n`);
}
