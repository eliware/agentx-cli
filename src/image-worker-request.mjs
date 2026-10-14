import { path } from "@eliware/common";
import { createImageWorkerEnvironment } from "./image-worker-environment.mjs";

export function createImageWorkerLaunch(args, options = {}, sourceEnv = process.env) {
  const { cwd, responseId, previousResponseId, model } = options;
  const env = createImageWorkerEnvironment(sourceEnv);
  env.AGENTX_IMAGE_REQUEST = JSON.stringify({ args, cwd, responseId, previousResponseId, model });
  return {
    command: process.execPath,
    args: [path(import.meta, "./image-worker.mjs")],
    options: { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
  };
}
