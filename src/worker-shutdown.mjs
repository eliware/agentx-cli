import { requestWorkerCancellation } from "./worker-child-lifecycle.mjs";

export async function terminateWorkerChildren({ state, persistWorker, graceMs }) {
  const active = [...state.children.entries()];
  for (const [id, child] of active) {
    const worker = state.workers.get(id);
    await requestWorkerCancellation({ worker, child, persistWorker });
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
