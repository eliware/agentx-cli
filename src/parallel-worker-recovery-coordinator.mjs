import { cleanupWorkerRecords, listWorkerRecords, readWorkerLog } from "./worker-registry.mjs";
import { workerProcessState, persistWorker } from "./worker-process.mjs";
import { recoverWorkers } from "./parallel-worker-recovery.mjs";

export function recoverParallelWorkers(cwd) {
  return recoverWorkers(cwd, {
    cleanup: cleanupWorkerRecords,
    list: listWorkerRecords,
    readLog: readWorkerLog,
    persist: persistWorker,
    state: workerProcessState,
  });
}
