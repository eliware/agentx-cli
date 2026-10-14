import { parseWorkerIds } from "./parallel-worker-arguments.mjs";
import {
  resolveWorkerCancelTarget,
  workerCancelResult,
} from "./parallel-worker-cancel-selection.mjs";
import { cancelRecoveredWorkerProcess } from "./parallel-worker-process-cancel.mjs";
import { cancelLiveWorkerProcess } from "./parallel-worker-live-cancel.mjs";

export async function cancelWorkers(args, cwd, { state, readRecord, persist }) {
  const ids = parseWorkerIds(args);
  const agents = [];
  for (const id of ids) {
    const target = await resolveWorkerCancelTarget(id, cwd, { state, readRecord });
    const { worker, child } = target;
    if (!worker) {
      agents.push(target.result);
      continue;
    }
    if (child && ["running", "timed_out"].includes(worker.status)) {
      await cancelLiveWorkerProcess(worker, child, persist);
    } else if (!child && ["running", "timed_out"].includes(worker.status) && worker.pid) {
      await cancelRecoveredWorkerProcess(worker, persist);
    }
    agents.push(workerCancelResult(worker, args));
  }
  return { agents };
}
