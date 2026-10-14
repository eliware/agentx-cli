import { isWorkerTerminal, normalizeWorkerWait, snapshotWorker } from "./worker-status.mjs";

export async function spawnWorker(args, cwd, options, startWorker) {
  if (process.env.AGENTX_WORKER_ID) return { error: "nested worker spawning is disabled" };
  const task = typeof args.task === "string" ? args.task.trim() : "";
  if (!task) return { error: "task must be a non-empty string" };
  const permissions = ["read", "write", "execute"].includes(args.permissions)
    ? args.permissions
    : "execute";
  const worker = startWorker(
    task,
    cwd,
    permissions,
    options.debug === true,
    options.onWorkerUsage,
    options.onWorkerComplete,
  );
  const wait = normalizeWorkerWait(args.wait_ms);
  const deadline = Date.now() + wait;
  while (wait > 0 && !isWorkerTerminal(worker.status) && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    agent: snapshotWorker(worker, args),
    waited_ms: wait,
    timed_out: wait > 0 && !isWorkerTerminal(worker.status),
  };
}
