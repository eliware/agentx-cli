export function reportWorkerUsage(worker, onUsage) {
  if (!worker?.usage || worker.usageReported) return false;
  worker.usageReported = true;
  onUsage?.(worker.usage, worker);
  return true;
}
