export function normalizeTerminationOutcome({
  interrupted = false,
  timedOut = false,
  signal = null,
  code = null,
} = {}) {
  if (interrupted || timedOut) return { type: "timeout" };
  if (signal) return { type: "exit", exit_code: 1 };
  return { type: "exit", exit_code: Number.isFinite(code) ? Number(code) : 1 };
}
