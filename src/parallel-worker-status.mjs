import { isWorkerTerminal, normalizeWorkerWait, snapshotWorker } from "./worker-status.mjs";
import { parseWorkerIds } from "./parallel-worker-arguments.mjs";

export async function getWorkerStatus(args, state) {
  const ids = parseWorkerIds(args);
  const wait = normalizeWorkerWait(args.wait_ms);
  const deadline = Date.now() + wait;
  const read = () =>
    ids.map((id) =>
      state.workers.has(id)
        ? snapshotWorker(state.workers.get(id), args)
        : { id, status: "unknown" },
    );
  let agents = read();
  while (
    wait > 0 &&
    agents.some((item) => !isWorkerTerminal(item.status)) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    agents = read();
  }
  return {
    agents,
    waited_ms: wait,
    timed_out: wait > 0 && agents.some((item) => !isWorkerTerminal(item.status)),
  };
}
