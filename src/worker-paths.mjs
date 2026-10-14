import { join } from "node:path";
import { workerProjectKey } from "./worker-project-key.mjs";
import { workerStateDirectory } from "./worker-state-root.mjs";

const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function workerDirectory(cwd, platform = process.platform, root = workerStateDirectory()) {
  return join(root, "workers", workerProjectKey(cwd, platform));
}

export function legacyWorkerDirectory(cwd) {
  return join(cwd, ".agentx", "workers");
}

export function workerFilePath(directory, id, suffix) {
  if (!WORKER_ID_PATTERN.test(String(id))) throw new Error("Invalid worker ID");
  return join(directory, `${id}${suffix}`);
}

export function workerRecordPath(cwd, id) {
  return workerFilePath(workerDirectory(cwd), id, ".json");
}

export function workerLogPath(cwd, id) {
  return workerFilePath(workerDirectory(cwd), id, ".log");
}

export const workerPathInternals = { WORKER_ID_PATTERN };
