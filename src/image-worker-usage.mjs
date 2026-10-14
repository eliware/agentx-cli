export function createImageWorkerUsage() {
  const usage = { turns: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
  return {
    usage,
    add(value) {
      usage.turns += value?.turns || 1;
      usage.inputTokens += value?.inputTokens || 0;
      usage.cachedTokens += value?.cachedTokens || 0;
      usage.outputTokens += value?.outputTokens || 0;
    },
  };
}
