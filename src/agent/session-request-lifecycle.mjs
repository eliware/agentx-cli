export async function runWithSessionRequestLifecycle({ context, attachListener, attempt }) {
  const goalRequestActive = context.getGoal()?.status === "active";
  const detachGoalInterrupt = attachListener({
    oneShot: context.oneShot,
    terminalInput: context.terminalInput,
    getGoal: context.getGoal,
    setGoal: context.setGoal,
    saveState: context.saveState,
  });
  try {
    return await attempt();
  } finally {
    detachGoalInterrupt();
    if (goalRequestActive) context.replaceReplInterface();
  }
}
