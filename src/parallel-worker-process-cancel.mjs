export async function cancelRecoveredWorkerProcess(worker, persist, signal = process.kill) {
  try {
    signal(worker.pid, "SIGTERM");
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
