export async function routeSessionCommand({ internal, message, state, deps }) {
  if (internal?.type === "setup") {
    state.template = await deps.runSetupFlow();
    return { action: "continue" };
  }

  const goalCommand = deps.transitionGoalCommand(state.activeGoal, internal);
  if (goalCommand.handled) {
    state.activeGoal = goalCommand.goal;
    if (goalCommand.persist) await deps.saveState();
    if (goalCommand.message) deps.writeSystem(goalCommand.message);
    if (goalCommand.inputMessage) message = goalCommand.inputMessage;
    if (goalCommand.continue) return { action: "continue" };
  }

  if (internal?.type === "exit") {
    await deps.exitWithSummary();
    return { action: "exit" };
  }

  if (internal?.type === "session_clear") {
    if (!deps.noUsage)
      deps.printUsageReport(deps.getSessionUsage(), { model: state.template.model });
    deps.resetState(deps.createUsageTotals());
    await deps.clearSession(deps.statePath);
    deps.writeSystem("Session cleared");
    return { action: "continue" };
  }

  if (internal?.type === "rollback") {
    await deps.runRollbackFlow();
    return { action: "continue" };
  }

  if (internal?.type === "usage") {
    if (!deps.noUsage)
      deps.printUsageReport(deps.getSessionUsage(), { model: state.template.model });
    return { action: "continue" };
  }

  if (internal?.type === "cd") {
    try {
      const oldCwd = state.cwd;
      state.cwd = await deps.resolveCdTarget(internal.target, state.cwd, {
        previousCwd: state.previousCwd,
      });
      state.previousCwd = oldCwd;
      state.cwdNote = deps.buildWorkingDirectoryNote(state.cwd);
      deps.writeSystem(`Directory changed to ${state.cwd}`);
    } catch (error) {
      deps.writeSystem(error?.message || String(error));
    }
    return { action: "continue" };
  }

  return { action: "request", message };
}
