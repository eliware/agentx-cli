import { killShellProcess } from "./shell-termination.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const TERMINATION_GRACE_MS = 250;

export function startShellTermination({
  child,
  timeoutMs,
  signal,
  platform,
  onTimeout,
  onInterrupt,
  shouldTerminate = () => true,
}) {
  let timer = null;
  let escalation = null;
  let requested = false;
  const terminate = () => {
    if (requested || !shouldTerminate()) return;
    requested = true;
    killShellProcess(child, "SIGTERM", platform);
    escalation = setTimeout(
      () => killShellProcess(child, "SIGKILL", platform),
      TERMINATION_GRACE_MS,
    );
  };
  const duration =
    timeoutMs === null
      ? 0
      : Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_TIMEOUT_MS;
  if (duration > 0)
    timer = setTimeout(() => {
      if (!shouldTerminate()) return;
      onTimeout();
      terminate();
    }, duration);
  const abort = () => {
    if (!shouldTerminate()) return;
    onInterrupt();
    terminate();
  };
  if (signal?.aborted) abort();
  else signal?.addEventListener?.("abort", abort, { once: true });
  return () => {
    if (timer) clearTimeout(timer);
    if (escalation) clearTimeout(escalation);
    signal?.removeEventListener?.("abort", abort);
  };
}
