export async function recreateOpenAIClient(current, createClient) {
  try { await current?.responses?.close?.(); } catch { /* stale transport cleanup is best effort */ }
  return createClient();
}
