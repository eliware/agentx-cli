export async function handleSessionPromptError(
  error,
  { getGoal, setGoal, saveState, write, formatMessage, exitWithSummary },
) {
  if (error?.name !== "AbortError" && error?.code !== "ABORT_ERR") throw error;
  const goal = getGoal();
  if (goal?.status === "active") {
    setGoal({ ...goal, status: "cancelled", cancelled_at: new Date().toISOString() });
    await saveState();
    write(`${formatMessage("Goal cancelled")}\n`);
    return "continue";
  }
  await exitWithSummary({ leadingNewline: true });
  return "return";
}
