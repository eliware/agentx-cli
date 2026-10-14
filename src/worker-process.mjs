import { spawn } from "node:child_process";
import { path, snowflake } from "@eliware/common";
import { persistWorkerRecord } from "./worker-process-record.mjs";
import { attachWorkerLifecycle } from "./worker-child-lifecycle.mjs";
import { terminateWorkerChildren } from "./worker-shutdown.mjs";

const SHUTDOWN_GRACE_MS = 2000;
const WORKER_TIMEOUT_MS = 10 * 60 * 1000;
export const workerProcessState = { workers: new Map(), children: new Map() };
const entrypoint = path(import.meta, "./agent-entrypoint.mjs");
const workerEnvironmentKeys = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "ComSpec",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "NODE_PATH",
  "NODE_OPTIONS",
  "AGENTX_API_KEY",
  "agentx_api_key",
];

export function workerLaunchArgs(entrypointPath, task, debug = false) {
  return [entrypointPath, ...(debug ? ["--debug"] : []), "--", task];
}

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
  const env = Object.fromEntries(
    workerEnvironmentKeys
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
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
