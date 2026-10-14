import { path } from "@eliware/common";

const RUNTIME_ENV_KEYS = new Set(["path", "systemroot", "windir", "temp", "tmp"]);

export function createImageWorkerLaunch(args, options = {}, sourceEnv = process.env) {
  const { cwd, responseId, previousResponseId, model } = options;
  const env = Object.fromEntries(
    Object.entries(sourceEnv).filter(([key]) => RUNTIME_ENV_KEYS.has(key.toLowerCase())),
  );
  if (sourceEnv.agentx_api_key) env.agentx_api_key = sourceEnv.agentx_api_key;
  if (sourceEnv.AGENTX_API_KEY) env.AGENTX_API_KEY = sourceEnv.AGENTX_API_KEY;
  env.AGENTX_IMAGE_REQUEST = JSON.stringify({ args, cwd, responseId, previousResponseId, model });
  return {
    command: process.execPath,
    args: [path(import.meta, "./image-worker.mjs")],
    options: { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
  };
}
