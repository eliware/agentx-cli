const runtimeEnvironmentKeys = new Set(["path", "systemroot", "windir", "temp", "tmp"]);

export function createImageWorkerEnvironment(sourceEnv = process.env) {
  const env = Object.fromEntries(
    Object.entries(sourceEnv).filter(([key]) => runtimeEnvironmentKeys.has(key.toLowerCase())),
  );
  if (sourceEnv.agentx_api_key) env.agentx_api_key = sourceEnv.agentx_api_key;
  if (sourceEnv.AGENTX_API_KEY) env.AGENTX_API_KEY = sourceEnv.AGENTX_API_KEY;
  return env;
}
