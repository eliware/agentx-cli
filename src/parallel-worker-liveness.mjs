export async function markMissingWorkerProcess(worker, persist, checkProcess = process.kill) {
  try {
    checkProcess(worker.pid, 0);
    return false;
  } catch {
    worker.status = "failed";
    worker.error = "worker process no longer exists";
    worker.finishedAt = Date.now();
    await persist(worker);
    return true;
  }
}
