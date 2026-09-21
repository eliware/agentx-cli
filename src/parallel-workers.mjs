import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { path } from "@eliware/common";
import { redactText } from "@eliware/redact";
import {
  appendWorkerLog,
  cleanupWorkerRecords,
  listWorkerRecords,
  readWorkerLog,
  readWorkerRecord,
  saveWorkerRecord,
} from "./worker-registry.mjs";
import { stripAnsi } from "./usage.mjs";

const WORKER_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_WAIT_MS = 0;
const MAX_WAIT_MS = 180000;
const MIN_WAIT_MS = 0;
const workers = new Map();
const workerChildren = new Map();
const SHUTDOWN_GRACE_MS = 2000;
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

function argsFor(call) {
  const raw = call?.arguments ?? call?.input ?? "{}";
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function waitMs(value) {
  const n = Number(value ?? DEFAULT_WAIT_MS);
  return Number.isFinite(n) ? Math.min(Math.max(n, MIN_WAIT_MS), MAX_WAIT_MS) : DEFAULT_WAIT_MS;
}
export function redactWorkerLogText(text, environment = process.env) {
  const secrets = [environment.AGENTX_API_KEY, environment.agentx_api_key].filter(
    (value) => typeof value === "string" && value.length > 0,
  );
  return redactText(text, { secrets });
}
export function workerLaunchArgs(entrypointPath, task, debug = false) {
  return [entrypointPath, ...(debug ? ["--debug"] : []), "--", task];
}

export function parseWorkerUsage(text) {
  const reports = String(text)
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(stripAnsi(line));
      } catch {
        return null;
      }
    })
    .filter(
      (report) =>
        report &&
        typeof report === "object" &&
        typeof report.in === "string" &&
        typeof report.cache === "string" &&
        typeof report.out === "string",
    );
  if (!reports.length) return null;
  const reportsToSum = reports.filter(
    (report) =>
      !Object.prototype.hasOwnProperty.call(report, "turns") &&
      !Object.prototype.hasOwnProperty.call(report, "avg"),
  );
  const usage = {
    turns: 0,
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
  for (const report of reportsToSum) {
    const parseTokens = (value) => Number(String(value).split(" ")[0].replaceAll(",", ""));
    usage.inputTokens += parseTokens(report.in);
    usage.cachedTokens += parseTokens(report.cache);
    if (report.write) usage.cacheWriteTokens += parseTokens(report.write);
    usage.outputTokens += parseTokens(report.out);
    if (report.reasoning) usage.reasoningTokens += parseTokens(report.reasoning);
    usage.turns += 1;
  }
  if (!usage.cacheWriteTokens) delete usage.cacheWriteTokens;
  if (!usage.reasoningTokens) delete usage.reasoningTokens;
  return usage.turns ? usage : null;
}
export function reportWorkerUsage(worker, onUsage) {
  if (!worker?.usage || worker.usageReported) return false;
  worker.usageReported = true;
  onUsage?.(worker.usage, worker);
  return true;
}
export function selectWorkerOutput(text, options = {}) {
  const maxBytes = Math.min(Math.max(Number(options.output_bytes) || 2048, 1), 8192);
  const offsetBytes = Math.max(Number(options.output_offset) || 0, 0);
  let output;
  if (options.search !== undefined) {
    try {
      const pattern = new RegExp(options.search, "i");
      output = text
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((line) => pattern.test(line))
        .join("\n");
    } catch {
      output = "";
    }
  } else {
    const bytes = Buffer.from(text);
    const end = Math.max(0, bytes.length - offsetBytes);
    output = bytes.subarray(Math.max(0, end - maxBytes), end).toString();
  }
  return Buffer.from(output).subarray(0, maxBytes).toString();
}
function snapshot(worker, options = {}) {
  return {
    id: worker.id,
    task: worker.task,
    status: worker.status,
    pid: worker.pid,
    cwd: worker.cwd,
    elapsed_ms: (worker.finishedAt || Date.now()) - worker.startedAt,
    lines: worker.lines,
    output: selectWorkerOutput(worker.output || "", options),
    usage: worker.usage,
    ...(worker.error ? { error: worker.error } : {}),
  };
}
function terminal(status) {
  return ["completed", "failed", "timed_out", "terminated", "cancelled", "unknown"].includes(
    status,
  );
}

async function persist(worker) {
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

function startWorker(task, cwd, permissions, debug, onUsage, onComplete) {
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
  workers.set(worker.id, worker);
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
  workerChildren.set(worker.id, child);
  void persist(worker).catch(() => {});
  let writeQueue = Promise.resolve();
  let bufferedLog = "";
  let flushTimer = null;
  let finalized = false;
  const flushLog = () => {
    const text = redactWorkerLogText(bufferedLog);
    bufferedLog = "";
    if (!text) return;
    writeQueue = writeQueue
      .then(() => appendWorkerLog(cwd, worker.id, text).then(() => persist(worker)))
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
    workerChildren.delete(worker.id);
    flushLog();
    void writeQueue.then(() => persist(worker)).catch(() => {});
    reportWorkerUsage(worker, onUsage);
    onComplete?.(worker);
  };
  worker.timeout = setTimeout(() => {
    worker.status = "timed_out";
    worker.error = `worker exceeded ${WORKER_TIMEOUT_MS}ms`;
    void persist(worker).catch(() => {});
    child.kill("SIGTERM");
    worker.killTimer = setTimeout(() => {
      if (!worker.exited) child.kill("SIGKILL");
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

async function recover(cwd, onUsage, onComplete) {
  await cleanupWorkerRecords(cwd);
  for (const record of await listWorkerRecords(cwd)) {
    if (workers.has(record.id)) continue;
    const worker = {
      id: record.id,
      task: record.task,
      cwd: record.cwd || cwd,
      permissions: record.permissions,
      debug: record.debug,
      status: record.status,
      pid: record.pid,
      startedAt: Date.parse(record.started_at) || Date.now(),
      finishedAt: record.finished_at ? Date.parse(record.finished_at) : null,
      lines: record.lines || 0,
      usage: record.usage,
      output: await readWorkerLog(record.cwd || cwd, record.id),
      usageReported: true,
      exited: terminal(record.status),
    };
    if (!terminal(worker.status) && worker.pid) {
      try {
        process.kill(worker.pid, 0);
      } catch {
        worker.status = "failed";
        worker.error = "worker process no longer exists";
        worker.finishedAt = Date.now();
        await persist(worker);
      }
    }
    workers.set(worker.id, worker);
    if (terminal(worker.status)) {
      const reported = reportWorkerUsage(worker, onUsage);
      if (reported) onComplete?.(worker);
    }
  }
}

export async function terminateWorkers() {
  const active = [...workerChildren.entries()];
  for (const [id, child] of active) {
    const worker = workers.get(id);
    if (worker && !terminal(worker.status)) {
      worker.status = "cancelled";
      worker.error = "parent shutdown";
      worker.finishedAt = Date.now();
      await persist(worker).catch(() => {});
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

export async function runParallelWorkerFunction(call, cwd, options = {}) {
  if (!call || typeof call !== "object" || Array.isArray(call))
    return { error: "invalid worker function call" };
  if (typeof cwd !== "string" || !cwd.trim()) return { error: "invalid working directory" };
  await recover(cwd, options.onWorkerUsage, options.onWorkerComplete);
  const args = argsFor(call);
  if (call.name === "spawn_agent") {
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
    const wait = waitMs(args.wait_ms);
    if (wait > 0) {
      const deadline = Date.now() + wait;
      while (!terminal(worker.status) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      agent: snapshot(worker, args),
      waited_ms: wait,
      timed_out: wait > 0 && !terminal(worker.status),
    };
  }
  if (call.name === "cancel_agent") {
    const ids = Array.isArray(args.agent_ids)
      ? args.agent_ids.filter((id) => typeof id === "string" && id.trim()).slice(0, 10)
      : [];
    const agents = [];
    for (const id of ids) {
      const worker = workers.get(id);
      const child = workerChildren.get(id);
      if (!worker) {
        const record = await readWorkerRecord(cwd, id);
        agents.push(record ? { id, status: record.status } : { id, status: "unknown" });
        continue;
      }
      if (child && ["running", "timed_out"].includes(worker.status)) {
        worker.status = "cancelled";
        worker.error = "cancelled by request";
        worker.finishedAt = Date.now();
        await persist(worker);
        child.kill("SIGTERM");
      }
      agents.push(snapshot(worker, args));
    }
    return { agents };
  }
  if (call.name === "agent_status") {
    const ids = Array.isArray(args.agent_ids)
      ? args.agent_ids.filter((id) => typeof id === "string" && id.trim()).slice(0, 10)
      : [];
    const wait = waitMs(args.wait_ms);
    const deadline = Date.now() + wait;
    let agents = ids.map((id) =>
      workers.has(id) ? snapshot(workers.get(id), args) : { id, status: "unknown" },
    );
    while (wait > 0 && agents.some((item) => !terminal(item.status)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      agents = ids.map((id) =>
        workers.has(id) ? snapshot(workers.get(id), args) : { id, status: "unknown" },
      );
    }
    return {
      agents,
      waited_ms: wait,
      timed_out: wait > 0 && agents.some((item) => !terminal(item.status)),
    };
  }
  return { error: `unsupported worker function ${call.name || ""}` };
}
