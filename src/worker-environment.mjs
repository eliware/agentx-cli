const workerEnvironmentKeys = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "ComSpec",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "NODE_PATH",
  "NODE_OPTIONS",
  "AGENTX_API_KEY",
  "agentx_api_key",
];

export function buildWorkerEnvironment(source = process.env) {
  return Object.fromEntries(
    workerEnvironmentKeys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}
