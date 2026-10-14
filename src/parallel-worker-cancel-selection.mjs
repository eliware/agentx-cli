import { snapshotWorker } from "./worker-status.mjs";

export async function resolveWorkerCancelTarget(id, cwd, { state, readRecord }) {
  const worker = state.workers.get(id);
  if (worker) return { worker, child: state.children.get(id) };
  const record = await readRecord(cwd, id);
  return { worker: null, child: null, result: { id, status: record?.status || "unknown" } };
}

export function workerCancelResult(worker, args) {
  return snapshotWorker(worker, args);
}
