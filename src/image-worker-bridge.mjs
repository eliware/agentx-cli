import { runImageInspectionProcess as runImageWorker } from "./image-worker-process.mjs";

const imageBranchQueues = new Map();

export async function runImageInspectionProcess(args, options = {}) {
  const key = `${options?.cwd || ""}:${options?.previousResponseId || options?.responseId || ""}`;
  const prior = imageBranchQueues.get(key) || Promise.resolve();
  const current = prior.catch(() => {}).then(() => runImageWorker(args, options));
  const tracked = current.finally(() => {
    if (imageBranchQueues.get(key) === tracked) imageBranchQueues.delete(key);
  });
  imageBranchQueues.set(key, tracked);
  return current;
}
