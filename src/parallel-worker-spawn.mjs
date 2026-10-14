import { isWorkerTerminal, normalizeWorkerWait, snapshotWorker } from "./worker-status.mjs";
import { waitForWorker } from "./parallel-worker-wait.mjs";
import { normalizeSpawnWorkerArguments } from "./parallel-worker-arguments.mjs";

export async function spawnWorker(args, cwd, options, startWorker) {
  if (process.env.AGENTX_WORKER_ID) return { error: "nested worker spawning is disabled" };
  const normalized = normalizeSpawnWorkerArguments(args);
  if (normalized.error) return normalized;
  const worker = startWorker(
    normalized.task,
    cwd,
    normalized.permissions,
    options.debug === true,
    options.onWorkerUsage,
    options.onWorkerComplete,
  );
  const wait = normalizeWorkerWait(args.wait_ms);
  const timedOut = await waitForWorker(wait, () => !isWorkerTerminal(worker.status));
  return {
    agent: snapshotWorker(worker, args),
    waited_ms: wait,
    timed_out: timedOut,
  };
}
