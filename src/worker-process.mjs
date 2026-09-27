import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { path } from "@eliware/common";
import { appendWorkerLog, saveWorkerRecord } from "./worker-registry.mjs";
import { redactWorkerLogText } from "./worker-output.mjs";
import { parseWorkerUsage, reportWorkerUsage } from "./worker-usage.mjs";
import { isWorkerTerminal } from "./worker-status.mjs";

const WORKER_TIMEOUT_MS = 10 * 60 * 1000;
const SHUTDOWN_GRACE_MS = 2000;
export const workerProcessState = { workers: new Map(), children: new Map() };
const entrypoint = path(import.meta, "../agentx.mjs");
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

export async function persistWorker(worker) {
  worker.updatedAt = Date.now();
  await saveWorkerRecord(worker.cwd, {
    id: worker.id,
    task: worker.task,
    status: worker.status,
    pid: worker.pid,
    cwd: worker.cwd,
    permissions: worker.permissions,
    debug: worker.debug,
    started_at: new Date(worker.startedAt).toISOString(),
    finished_at: worker.finishedAt ? new Date(worker.finishedAt).toISOString() : null,
    updated_at: new Date(worker.updatedAt).toISOString(),
    lines: worker.lines,
    usage: worker.usage,
    error: worker.error || null,
    exit_code: worker.exitCode ?? null,
    signal: worker.signal || null,
  });
}

export function startWorker(task, cwd, permissions, debug, onUsage, onComplete) {
  const worker = {
    id: `agent-${randomUUID()}`,
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
  let writeQueue = Promise.resolve();
  let bufferedLog = "";
  let flushTimer = null;
  let finalized = false;
  const flushLog = () => {
    const text = redactWorkerLogText(bufferedLog);
    bufferedLog = "";
    if (!text) return;
    writeQueue = writeQueue
      .then(() => appendWorkerLog(cwd, worker.id, text).then(() => persistWorker(worker)))
      .catch(() => {});
  };
  const append = (chunk) => {
    const text = String(chunk);
    worker.output = `${worker.output}${text}`.slice(-10 * 1024 * 1024);
    worker.lines += text.split(/\r?\n/).filter(Boolean).length;
    worker.usage = parseWorkerUsage(worker.output) || worker.usage;
    bufferedLog += text;
    if (!flushTimer)
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushLog();
      }, 50);
  };
  const finalize = (status, error = null, code = null, signal = null) => {
    if (finalized) return;
    finalized = true;
    worker.exited = true;
    clearTimeout(worker.timeout);
    clearTimeout(worker.killTimer);
    clearTimeout(flushTimer);
    flushTimer = null;
    worker.status = status;
    worker.error = error?.message || error || null;
    worker.exitCode = code;
    worker.signal = signal;
    worker.finishedAt = Date.now();
    workerProcessState.children.delete(worker.id);
    flushLog();
    void writeQueue.then(() => persistWorker(worker)).catch(() => {});
    reportWorkerUsage(worker, onUsage);
    onComplete?.(worker);
  };
  worker.timeout = setTimeout(() => {
    worker.status = "timed_out";
    worker.error = `worker exceeded ${WORKER_TIMEOUT_MS}ms`;
    void persistWorker(worker).catch(() => {});
    child.kill("SIGTERM");
    worker.killTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, SHUTDOWN_GRACE_MS);
  }, WORKER_TIMEOUT_MS);
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("error", (error) => {
    finalize("failed", error);
  });
  child.on("close", (code, signal) => {
    const status =
      worker.status === "timed_out"
        ? "timed_out"
        : worker.status === "cancelled"
          ? "cancelled"
          : code === 0
            ? "completed"
            : "failed";
    finalize(status, worker.error, code, signal);
  });
  child.unref();
  return worker;
}

export async function terminateWorkers() {
  const active = [...workerProcessState.children.entries()];
  for (const [id, child] of active) {
    const worker = workerProcessState.workers.get(id);
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
  await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS));
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
