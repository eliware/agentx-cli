import {
  cleanupWorkerRecords,
  listWorkerRecords,
  readWorkerLog,
  readWorkerRecord,
} from "./worker-registry.mjs";
import {
  workerProcessState,
  persistWorker,
  startWorker,
  terminateWorkers,
  workerLaunchArgs,
} from "./worker-process.mjs";
import { parseWorkerArguments } from "./parallel-worker-arguments.mjs";
import { recoverWorkers } from "./parallel-worker-recovery.mjs";
import { spawnWorker } from "./parallel-worker-spawn.mjs";
import { cancelWorkers } from "./parallel-worker-cancel.mjs";
import { getWorkerStatus } from "./parallel-worker-status.mjs";

export { terminateWorkers, workerLaunchArgs };

export async function runParallelWorkerFunction(call, cwd, options = {}) {
  if (!call || typeof call !== "object" || Array.isArray(call))
    return { error: "invalid worker function call" };
  if (typeof cwd !== "string" || !cwd.trim()) return { error: "invalid working directory" };
  const args = parseWorkerArguments(call);
  await recoverWorkers(cwd, {
    cleanup: cleanupWorkerRecords,
    list: listWorkerRecords,
    readLog: readWorkerLog,
    persist: persistWorker,
    state: workerProcessState,
  });
  if (call.name === "spawn_agent") return spawnWorker(args, cwd, options, startWorker);
  if (call.name === "cancel_agent")
    return cancelWorkers(args, cwd, {
      state: workerProcessState,
      readRecord: readWorkerRecord,
      persist: persistWorker,
    });
  if (call.name === "agent_status") return getWorkerStatus(args, workerProcessState);
  return { error: `unsupported worker function ${call.name || ""}` };
}
