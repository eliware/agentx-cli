import { readWorkerRecord } from "./worker-registry.mjs";
import { workerProcessState, persistWorker, startWorker } from "./worker-process.mjs";
import { parseWorkerArguments } from "./parallel-worker-arguments.mjs";
import { recoverParallelWorkers } from "./parallel-worker-recovery-coordinator.mjs";
import { spawnWorker } from "./parallel-worker-spawn.mjs";
import { cancelWorkers } from "./parallel-worker-cancel.mjs";
import { getWorkerStatus } from "./parallel-worker-status.mjs";
import {
  unsupportedParallelWorkerCall,
  validateParallelWorkerCall,
} from "./parallel-worker-call-policy.mjs";

export { isParallelWorkerFunctionCall } from "./parallel-worker-call-policy.mjs";

export async function runParallelWorkerFunction(call, cwd, options = {}) {
  const validationError = validateParallelWorkerCall(call, cwd);
  if (validationError) return validationError;
  const args = parseWorkerArguments(call);
  await recoverParallelWorkers(cwd);
  if (call.name === "spawn_agent") return spawnWorker(args, cwd, options, startWorker);
  if (call.name === "cancel_agent")
    return cancelWorkers(args, cwd, {
      state: workerProcessState,
      readRecord: readWorkerRecord,
      persist: persistWorker,
    });
  if (call.name === "agent_status") return getWorkerStatus(args, workerProcessState);
  return unsupportedParallelWorkerCall(call);
}
