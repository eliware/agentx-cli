export async function applySessionRecoveryAction({
  action,
  state,
  createSessionClient,
  history,
  input,
  output,
  checkpointPath,
  statePath,
  deps,
}) {
  if (action === "retry" || action === "debug-retry") {
    state.openai = await deps.recreateOpenAIClient(state.openai, createSessionClient);
    deps.setActiveOpenAI(state.openai);
    if (action === "debug-retry" && !state.debugEnabled) {
      state.debugEnabled = true;
      deps.bindDebugListeners(state.openai);
      deps.writeDebugEnabled();
    }
    state.retryRequest = state.pendingRetryRequest;
    return { control: "retry" };
  }
  if (action === "new-chain") {
    state.clearPendingContinuationForNewChain();
    await deps.saveState();
    return { control: "retry" };
  }
  if (action === "rollback") {
    const selected = await deps.promptRollback(history, { input, output });
    if (selected) {
      deps.applyRollback(selected);
      await deps.saveState();
      await deps.persistCheckpoint(checkpointPath, selected);
    }
    return { control: "end" };
  }
  if (action === "clear") {
    state.retryRequest = null;
    deps.resetState(deps.createUsageTotals());
    await deps.clearSession(statePath);
    deps.writeSystem("Session cleared");
  }
  return { control: "end" };
}
