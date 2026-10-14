import { appendWorkerLog } from "./worker-registry.mjs";
import { redactWorkerLog } from "./worker-log-redaction.mjs";

export function createWorkerLogStream(worker, persistWorker) {
  let writeQueue = Promise.resolve();
  let bufferedLog = "";
  let flushTimer = null;

  const flush = () => {
    const text = redactWorkerLog(bufferedLog);
    bufferedLog = "";
    if (!text) return;
    writeQueue = writeQueue
      .then(() => appendWorkerLog(worker.cwd, worker.id, text).then(() => persistWorker(worker)))
      .catch(() => {});
  };

  return {
    append(chunk) {
      const text = String(chunk);
      bufferedLog += text;
      if (!flushTimer)
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flush();
        }, 50);
    },
    close() {
      clearTimeout(flushTimer);
      flushTimer = null;
      flush();
      return writeQueue.then(() => persistWorker(worker)).catch(() => {});
    },
  };
}
