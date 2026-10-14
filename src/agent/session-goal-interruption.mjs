import { cancelActiveSessionGoal } from "./session-goal-cancellation.mjs";

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
    void cancelActiveSessionGoal({ goal: getGoal(), setGoal, saveState, now }).catch(() => {});
  };
  terminalInput.setRawMode?.(true);
  terminalInput.on("data", onInput);
  return () => {
    terminalInput.removeListener?.("data", onInput);
    terminalInput.setRawMode?.(false);
    return interrupted;
  };
}
