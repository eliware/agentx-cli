import { redactText } from "@eliware/common";
import { appendWorkerLog } from "./worker-registry.mjs";
import { parseWorkerUsage, reportWorkerUsage } from "./worker-usage.mjs";

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
  let writeQueue = Promise.resolve();
  let bufferedLog = "";
  let flushTimer = null;
  let finalized = false;
  const flushLog = () => {
    const secrets = [process.env.AGENTX_API_KEY, process.env.agentx_api_key].filter(Boolean);
    const text = redactText(bufferedLog, { secrets });
    bufferedLog = "";
    if (!text) return;
    writeQueue = writeQueue
      .then(() => appendWorkerLog(worker.cwd, worker.id, text).then(() => persistWorker(worker)))
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
    state.children.delete(worker.id);
    flushLog();
    void writeQueue.then(() => persistWorker(worker)).catch(() => {});
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
  child.stdout.on("data", append);
  child.stderr.on("data", append);
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
