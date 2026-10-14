import { isWorkerTerminal } from "./worker-status.mjs";

export async function requestWorkerCancellation({ worker, child, persistWorker }) {
  if (worker && !isWorkerTerminal(worker.status)) {
    worker.status = "cancelled";
    worker.error = "parent shutdown";
    worker.finishedAt = Date.now();
    await persistWorker(worker).catch(() => {});
  }
  try {
    child.kill("SIGTERM");
  } catch {
    /* best effort */
  }
}
