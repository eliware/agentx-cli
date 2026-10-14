import { reportWorkerUsage } from "./worker-usage-forwarding.mjs";
import { createWorkerLogStream } from "./worker-log-stream.mjs";
import { isWorkerTerminal } from "./worker-status.mjs";

export async function requestWorkerCancellation({ worker, child, persistWorker }) {
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

export function attachWorkerLifecycle({
  child,
  worker,
  onUsage,
  onComplete,
  state,
  persistWorker,
  timeoutMs,
  shutdownGraceMs,
}) {
  let finalized = false;
  const logStream = createWorkerLogStream(worker, persistWorker);
  const finalize = (status, error = null, code = null, signal = null) => {
    if (finalized) return;
    finalized = true;
    worker.exited = true;
    clearTimeout(worker.timeout);
    clearTimeout(worker.killTimer);
    worker.status = status;
    worker.error = error?.message || error || null;
    worker.exitCode = code;
    worker.signal = signal;
    worker.finishedAt = Date.now();
    state.children.delete(worker.id);
    void logStream.close();
    reportWorkerUsage(worker, onUsage);
    onComplete?.(worker);
  };
  worker.timeout = setTimeout(() => {
    worker.status = "timed_out";
    worker.error = `worker exceeded ${timeoutMs}ms`;
    void persistWorker(worker).catch(() => {});
    child.kill("SIGTERM");
    worker.killTimer = setTimeout(() => child.kill("SIGKILL"), shutdownGraceMs);
  }, timeoutMs);
  child.stdout.on("data", logStream.append);
  child.stderr.on("data", logStream.append);
  child.on("error", (error) => finalize("failed", error));
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
}
