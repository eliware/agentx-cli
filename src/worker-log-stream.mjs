import { redactText } from "@eliware/common";
import { appendWorkerLog } from "./worker-registry.mjs";
import { aggregateWorkerOutput } from "./worker-log-aggregation.mjs";

export function createWorkerLogStream(worker, persistWorker) {
  let writeQueue = Promise.resolve();
  let bufferedLog = "";
  let flushTimer = null;

  const flush = () => {
    const secrets = [process.env.AGENTX_API_KEY, process.env.agentx_api_key].filter(Boolean);
    const text = redactText(bufferedLog, { secrets });
    bufferedLog = "";
    if (!text) return;
    writeQueue = writeQueue
      .then(() => appendWorkerLog(worker.cwd, worker.id, text).then(() => persistWorker(worker)))
      .catch(() => {});
  };

  return {
    append(chunk) {
      const text = String(chunk);
      aggregateWorkerOutput(worker, text);
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
