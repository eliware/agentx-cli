import {
  cleanupWorkerRecords,
  listWorkerRecords,
  readWorkerLog,
  readWorkerRecord,
} from "./worker-registry.mjs";
import { isWorkerTerminal, normalizeWorkerWait, snapshotWorker } from "./worker-status.mjs";
import {
  persistWorker,
  startWorker,
  terminateWorkers,
  workerLaunchArgs,
  workerProcessState,
} from "./worker-process.mjs";

export { terminateWorkers, workerLaunchArgs };

function argsFor(call) {
  const raw = call?.arguments ?? call?.input ?? "{}";
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
async function recover(cwd) {
  await cleanupWorkerRecords(cwd);
  for (const record of await listWorkerRecords(cwd)) {
    if (workerProcessState.workers.has(record.id)) continue;
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
      exited: isWorkerTerminal(record.status),
    };
    if (!isWorkerTerminal(worker.status) && worker.pid) {
      try {
        process.kill(worker.pid, 0);
      } catch {
        worker.status = "failed";
        worker.error = "worker process no longer exists";
        worker.finishedAt = Date.now();
        await persistWorker(worker);
      }
    }
    workerProcessState.workers.set(worker.id, worker);
  }
}

export async function runParallelWorkerFunction(call, cwd, options = {}) {
  if (!call || typeof call !== "object" || Array.isArray(call))
    return { error: "invalid worker function call" };
  if (typeof cwd !== "string" || !cwd.trim()) return { error: "invalid working directory" };
  await recover(cwd);
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
    const wait = normalizeWorkerWait(args.wait_ms);
    if (wait > 0) {
      const deadline = Date.now() + wait;
      while (!isWorkerTerminal(worker.status) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      agent: snapshotWorker(worker, args),
      waited_ms: wait,
      timed_out: wait > 0 && !isWorkerTerminal(worker.status),
    };
  }
  if (call.name === "cancel_agent") {
    const ids = Array.isArray(args.agent_ids)
      ? args.agent_ids.filter((id) => typeof id === "string" && id.trim()).slice(0, 10)
      : [];
    const agents = [];
    for (const id of ids) {
      const worker = workerProcessState.workers.get(id);
      const child = workerProcessState.children.get(id);
      if (!worker) {
        const record = await readWorkerRecord(cwd, id);
        agents.push(record ? { id, status: record.status } : { id, status: "unknown" });
        continue;
      }
      if (child && ["running", "timed_out"].includes(worker.status)) {
        worker.status = "cancelled";
        worker.error = "cancelled by request";
        worker.finishedAt = Date.now();
        await persistWorker(worker);
        child.kill("SIGTERM");
      } else if (!child && ["running", "timed_out"].includes(worker.status) && worker.pid) {
        try {
          process.kill(worker.pid, "SIGTERM");
          worker.status = "cancelled";
          worker.error = "cancelled by request";
          worker.finishedAt = Date.now();
          await persistWorker(worker);
        } catch (error) {
          if (error?.code === "ESRCH") {
            worker.status = "failed";
            worker.error = "worker process no longer exists";
            worker.finishedAt = Date.now();
            await persistWorker(worker);
          }
        }
      }
      agents.push(snapshotWorker(worker, args));
    }
    return { agents };
  }
  if (call.name === "agent_status") {
    const ids = Array.isArray(args.agent_ids)
      ? args.agent_ids.filter((id) => typeof id === "string" && id.trim()).slice(0, 10)
      : [];
    const wait = normalizeWorkerWait(args.wait_ms);
    const deadline = Date.now() + wait;
    let agents = ids.map((id) =>
      workerProcessState.workers.has(id)
        ? snapshotWorker(workerProcessState.workers.get(id), args)
        : { id, status: "unknown" },
    );
    while (
      wait > 0 &&
      agents.some((item) => !isWorkerTerminal(item.status)) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      agents = ids.map((id) =>
        workerProcessState.workers.has(id)
          ? snapshotWorker(workerProcessState.workers.get(id), args)
          : { id, status: "unknown" },
      );
    }
    return {
      agents,
      waited_ms: wait,
      timed_out: wait > 0 && agents.some((item) => !isWorkerTerminal(item.status)),
    };
  }
  return { error: `unsupported worker function ${call.name || ""}` };
}
