import { cancelActiveSessionGoal } from "./session-goal-cancellation.mjs";

export async function handleSessionPromptError(
  error,
  {
    getGoal,
    setGoal,
    saveState,
    write,
    formatMessage,
    exitWithSummary,
    cancelGoal = cancelActiveSessionGoal,
  },
) {
  if (error?.name !== "AbortError" && error?.code !== "ABORT_ERR") throw error;
  const goal = getGoal();
  if (goal?.status === "active") {
    await cancelGoal({ goal, setGoal, saveState });
    write(`${formatMessage("Goal cancelled")}\n`);
    return "continue";
  }
  await exitWithSummary({ leadingNewline: true });
  return "return";
}
