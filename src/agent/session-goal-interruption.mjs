export async function cancelActiveSessionGoal({
  goal,
  setGoal,
  saveState,
  now = () => new Date().toISOString(),
}) {
  if (goal?.status !== "active") return false;
  setGoal({ ...goal, status: "cancelled", cancelled_at: now() });
  await saveState();
  return true;
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
