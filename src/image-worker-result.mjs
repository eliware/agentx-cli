export function formatImageWorkerResult({ stdout = "", stderr = "", code = null, onUsage, error }) {
  if (error) return `ERROR: ${error.message || String(error)}`;
  let result;
  try {
    result = JSON.parse(stdout);
    if (result.usage) onUsage?.(result.usage);
  } catch {
    return `ERROR: ${code !== 0 ? stderr.trim() || `image worker exited with code ${code}` : `invalid image worker response${stderr.trim() ? `: ${stderr.trim()}` : ""}`}`;
  }
  if (code !== 0)
    return `ERROR: ${stderr.trim() || result.error || `image worker exited with code ${code}`}`;
  return result.text || result.error || "The image inspection returned no text.";
}
