export function prepareSessionInput({ oneShot, terminalInput }) {
  if (oneShot || !terminalInput?.isTTY) return;
  terminalInput.setRawMode?.(true);
  terminalInput.resume?.();
}

export function attachGoalInterruptListener({
  oneShot,
  terminalInput,
  getGoal,
  setGoal,
  saveState,
  now = () => new Date().toISOString(),
}) {
  if (oneShot || getGoal()?.status !== "active" || !terminalInput?.on) return () => false;
  let interrupted = false;
  const onInput = (chunk) => {
    if (!String(chunk).includes("\x14")) return;
    interrupted = true;
    setGoal({ ...getGoal(), status: "cancelled", cancelled_at: now() });
    void saveState().catch(() => {});
  };
  terminalInput.setRawMode?.(true);
  terminalInput.on("data", onInput);
  return () => {
    terminalInput.removeListener?.("data", onInput);
    terminalInput.setRawMode?.(false);
    return interrupted;
  };
}
