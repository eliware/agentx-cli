import { saveWorkerRecord } from "./worker-registry.mjs";

export async function persistWorkerRecord(worker) {
  worker.updatedAt = Date.now();
  await saveWorkerRecord(worker.cwd, {
    id: worker.id,
    task: worker.task,
    status: worker.status,
    pid: worker.pid,
    cwd: worker.cwd,
    permissions: worker.permissions,
    debug: worker.debug,
    started_at: new Date(worker.startedAt).toISOString(),
    finished_at: worker.finishedAt ? new Date(worker.finishedAt).toISOString() : null,
    updated_at: new Date(worker.updatedAt).toISOString(),
    lines: worker.lines,
    usage: worker.usage,
    error: worker.error || null,
    exit_code: worker.exitCode ?? null,
    signal: worker.signal || null,
  });
}
