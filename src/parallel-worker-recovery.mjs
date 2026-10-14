import { isWorkerTerminal } from "./worker-status.mjs";
import { markMissingWorkerProcess } from "./parallel-worker-liveness.mjs";

export async function recoverWorkers(cwd, { cleanup, list, readLog, persist, state }) {
  await cleanup(cwd);
  for (const record of await list(cwd)) {
    if (state.workers.has(record.id)) continue;
    const worker = {
      id: record.id,
      task: record.task,
      cwd: record.cwd || cwd,
      permissions: record.permissions,
      debug: record.debug,
      status: record.status,
      pid: record.pid,
      startedAt: Date.parse(record.started_at) || Date.now(),
      finishedAt: record.finished_at ? Date.parse(record.finished_at) : null,
      lines: record.lines || 0,
      usage: record.usage,
      output: await readLog(record.cwd || cwd, record.id),
      usageReported: true,
      exited: isWorkerTerminal(record.status),
    };
    if (!isWorkerTerminal(worker.status) && worker.pid) {
      await markMissingWorkerProcess(worker, persist);
    }
    state.workers.set(worker.id, worker);
  }
}
