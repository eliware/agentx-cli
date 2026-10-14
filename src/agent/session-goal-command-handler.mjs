export async function applySessionGoalCommand({
  state,
  internal,
  transitionGoalCommand,
  saveState,
  writeSystem,
}) {
  const result = transitionGoalCommand(state.activeGoal, internal);
  if (!result.handled) return result;
  state.activeGoal = result.goal;
  if (result.persist) await saveState();
  if (result.message) writeSystem(result.message);
  return { handled: true, continue: result.continue, inputMessage: result.inputMessage };
}
