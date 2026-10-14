import { snapshotWorker } from "./worker-status.mjs";
import { cancelRecoveredWorkerProcess } from "./parallel-worker-process-cancel.mjs";
import { cancelLiveWorkerProcess } from "./parallel-worker-live-cancel.mjs";

export async function cancelWorkers(args, cwd, { state, readRecord, persist }) {
  const ids = Array.isArray(args.agent_ids)
    ? args.agent_ids.filter((id) => typeof id === "string" && id.trim()).slice(0, 10)
    : [];
  const agents = [];
  for (const id of ids) {
    const worker = state.workers.get(id);
    const child = state.children.get(id);
    if (!worker) {
      const record = await readRecord(cwd, id);
      agents.push(record ? { id, status: record.status } : { id, status: "unknown" });
      continue;
    }
    if (child && ["running", "timed_out"].includes(worker.status)) {
      await cancelLiveWorkerProcess(worker, child, persist);
    } else if (!child && ["running", "timed_out"].includes(worker.status) && worker.pid) {
      await cancelRecoveredWorkerProcess(worker, persist);
    }
    agents.push(snapshotWorker(worker, args));
  }
  return { agents };
}
