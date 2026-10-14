export function selectWorkerCancelAction(worker, child) {
  if (!worker || !["running", "timed_out"].includes(worker.status)) return "none";
  if (child) return "live";
  return worker.pid ? "recovered" : "none";
}
