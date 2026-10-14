export function createDebugEventHandler(stderr = process.stderr) {
  return (event, raw) => stderr.write(`[openai:event] ${JSON.stringify(raw ?? event)}\n`);
}
