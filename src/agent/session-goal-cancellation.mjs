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
