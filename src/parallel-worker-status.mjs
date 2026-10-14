import { isWorkerTerminal, normalizeWorkerWait, snapshotWorker } from "./worker-status.mjs";
import { parseWorkerIds } from "./parallel-worker-arguments.mjs";
import { waitForWorker } from "./parallel-worker-wait.mjs";

export async function getWorkerStatus(args, state) {
  const ids = parseWorkerIds(args);
  const wait = normalizeWorkerWait(args.wait_ms);
  const read = () =>
    ids.map((id) =>
      state.workers.has(id)
        ? snapshotWorker(state.workers.get(id), args)
        : { id, status: "unknown" },
    );
  let agents = read();
  const timedOut = await waitForWorker(wait, () => {
    agents = read();
    return agents.some((item) => !isWorkerTerminal(item.status));
  });
  return {
    agents,
    waited_ms: wait,
    timed_out: timedOut,
  };
}
