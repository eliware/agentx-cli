import { spawn } from "node:child_process";
import { path, snowflake } from "@eliware/common";
import { persistWorkerRecord } from "./worker-process-record.mjs";
import { attachWorkerLifecycle } from "./worker-child-lifecycle.mjs";
import { terminateWorkerChildren } from "./worker-shutdown.mjs";
import { buildWorkerEnvironment } from "./worker-environment.mjs";
import { workerLaunchArgs } from "./worker-launch-arguments.mjs";

export { workerLaunchArgs } from "./worker-launch-arguments.mjs";

const SHUTDOWN_GRACE_MS = 2000;
const WORKER_TIMEOUT_MS = 10 * 60 * 1000;
export const workerProcessState = { workers: new Map(), children: new Map() };
const entrypoint = path(import.meta, "./agent-entrypoint.mjs");
export const persistWorker = persistWorkerRecord;

export function startWorker(task, cwd, permissions, debug, onUsage, onComplete) {
  const worker = {
    id: `agent-${snowflake()}`,
    task,
    cwd,
    permissions,
    debug,
    status: "running",
    startedAt: Date.now(),
    lines: 0,
    output: "",
    usage: null,
    usageReported: false,
    exited: false,
    killTimer: null,
  };
  workerProcessState.workers.set(worker.id, worker);
  const env = buildWorkerEnvironment();
  const child = spawn(process.execPath, workerLaunchArgs(entrypoint, task, debug), {
    cwd,
    detached: true,
    env: { ...env, AGENTX_WORKER_ID: worker.id, AGENTX_PERMISSION: permissions },
    stdio: ["ignore", "pipe", "pipe"],
  });
  worker.pid = child.pid;
  workerProcessState.children.set(worker.id, child);
  void persistWorker(worker).catch(() => {});
  attachWorkerLifecycle({
    child,
    worker,
    onUsage,
    onComplete,
    state: workerProcessState,
    persistWorker,
    timeoutMs: WORKER_TIMEOUT_MS,
    shutdownGraceMs: SHUTDOWN_GRACE_MS,
  });
  child.unref();
  return worker;
}

export async function terminateWorkers() {
  return terminateWorkerChildren({
    state: workerProcessState,
    persistWorker,
    graceMs: SHUTDOWN_GRACE_MS,
  });
}
