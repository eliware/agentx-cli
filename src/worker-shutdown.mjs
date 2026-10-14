import { isWorkerTerminal } from "./worker-status.mjs";

export async function terminateWorkerChildren({ state, persistWorker, graceMs }) {
  const active = [...state.children.entries()];
  for (const [id, child] of active) {
    const worker = state.workers.get(id);
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
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  for (const [, child] of active) {
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* best effort */
      }
    }
  }
}
