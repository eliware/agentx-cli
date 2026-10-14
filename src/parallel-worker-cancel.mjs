import { snapshotWorker } from "./worker-status.mjs";

export async function cancelWorkers(args, cwd, { state, readRecord, persist }) {
  const ids = Array.isArray(args.agent_ids)
    ? args.agent_ids.filter((id) => typeof id === "string" && id.trim()).slice(0, 10)
    : [];
  const agents = [];
  for (const id of ids) {
    const worker = state.workers.get(id);
    const child = state.children.get(id);
    if (!worker) {
      const record = await readRecord(cwd, id);
      agents.push(record ? { id, status: record.status } : { id, status: "unknown" });
      continue;
    }
    if (child && ["running", "timed_out"].includes(worker.status)) {
      worker.status = "cancelled";
      worker.error = "cancelled by request";
      worker.finishedAt = Date.now();
      await persist(worker);
      child.kill("SIGTERM");
    } else if (!child && ["running", "timed_out"].includes(worker.status) && worker.pid) {
      await cancelProcess(worker, persist);
    }
    agents.push(snapshotWorker(worker, args));
  }
  return { agents };
}

async function cancelProcess(worker, persist) {
  try {
    process.kill(worker.pid, "SIGTERM");
    worker.status = "cancelled";
    worker.error = "cancelled by request";
    worker.finishedAt = Date.now();
    await persist(worker);
  } catch (error) {
    if (error?.code !== "ESRCH") return;
    worker.status = "failed";
    worker.error = "worker process no longer exists";
    worker.finishedAt = Date.now();
    await persist(worker);
  }
}
