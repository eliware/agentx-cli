export async function cancelLiveWorkerProcess(worker, child, persist) {
  worker.status = "cancelled";
  worker.error = "cancelled by request";
  worker.finishedAt = Date.now();
  await persist(worker);
  child.kill("SIGTERM");
}
