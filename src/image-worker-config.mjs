export function resolveImageWorkerApiKey(environment) {
  return environment.agentx_api_key || environment.AGENTX_API_KEY;
}

export function isValidImageWorkerRequest(args) {
  const prompt = String(args?.prompt ?? "");
  if (!prompt.trim()) return false;
  if (!Array.isArray(args?.images)) return false;
  if (args.images.length === 0 || args.images.length > 10) return false;
  if (prompt.length > 10_000) return false;
  return true;
}
