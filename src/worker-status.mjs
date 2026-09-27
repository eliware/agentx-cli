import { selectWorkerOutput } from "./worker-output.mjs";

const DEFAULT_WAIT_MS = 0;
const MAX_WAIT_MS = 180000;
const MIN_WAIT_MS = 0;
const terminalStatuses = new Set([
  "completed",
  "failed",
  "timed_out",
  "terminated",
  "cancelled",
  "unknown",
]);

export function isWorkerTerminal(status) {
  return terminalStatuses.has(status);
}

export function normalizeWorkerWait(value) {
  const number = Number(value ?? DEFAULT_WAIT_MS);
  return Number.isFinite(number)
    ? Math.min(Math.max(number, MIN_WAIT_MS), MAX_WAIT_MS)
    : DEFAULT_WAIT_MS;
}

export function snapshotWorker(worker, options = {}, now = Date.now()) {
  return {
    id: worker.id,
    task: worker.task,
    status: worker.status,
    pid: worker.pid,
    cwd: worker.cwd,
    elapsed_ms: (worker.finishedAt || now) - worker.startedAt,
    lines: worker.lines,
    output: selectWorkerOutput(worker.output || "", options),
    usage: worker.usage,
    ...(worker.error ? { error: worker.error } : {}),
  };
}
