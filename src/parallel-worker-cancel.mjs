import { parseWorkerIds } from "./parallel-worker-arguments.mjs";
import {
  resolveWorkerCancelTarget,
  workerCancelResult,
} from "./parallel-worker-cancel-selection.mjs";
import { cancelRecoveredWorkerProcess } from "./parallel-worker-process-cancel.mjs";
import { cancelLiveWorkerProcess } from "./parallel-worker-live-cancel.mjs";
import { selectWorkerCancelAction } from "./parallel-worker-cancel-policy.mjs";

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
    const action = selectWorkerCancelAction(worker, child);
    if (action === "live") {
      await cancelLiveWorkerProcess(worker, child, persist);
    } else if (action === "recovered") {
      await cancelRecoveredWorkerProcess(worker, persist);
    }
    agents.push(workerCancelResult(worker, args));
  }
  return { agents };
}
