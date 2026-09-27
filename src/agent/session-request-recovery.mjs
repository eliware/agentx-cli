export async function resolveSessionRequestFailure({
  error,
  state,
  oneShot,
  history = [],
  statePath,
  checkpointPath,
  input,
  output,
  createSessionClient,
  now = Date.now,
  deps,
}) {
  const websocketExpired = deps.isWebsocketRecoveryError(error);
  let websocketRetryAvailable = false;
  if (websocketExpired) {
    state.websocketRecoveryStartedAt ??= now();
    websocketRetryAvailable = await deps.waitForWebsocketRetry(
      state.websocketRecoveryStartedAt,
      state.websocketRecoveryAttempts,
    );
  }
  const recovery = deps.decideRequestFailure(error, {
    oneShot,
    recoveryAttempts: state.recoveryAttempts,
    previousResponseId: state.previousResponseId,
    websocketRetryAvailable,
  });
  state.recoveryAttempts = recovery.recoveryAttempts;

  if (recovery.action === "reconnect") {
    state.websocketRecoveryAttempts += 1;
    state.openai = await deps.recreateOpenAIClient(state.openai, createSessionClient);
    deps.setActiveOpenAI(state.openai);
    deps.writeSystem("Responses connection expired; reconnecting.");
    return { control: "retry" };
  }
  if (recovery.action === "new-chain") {
    state.previousResponseId = "";
    state.retryRequest = null;
    state.pendingRetryRequest = null;
    deps.writeSystem("Previous response not found; starting a new chain.");
    return { control: "retry" };
  }

  state.failedResponse = true;
  if (!state.pendingTransaction?.request) state.pendingToolCalls = [];
  await deps.saveState();
  if (oneShot) {
    if (recovery.action === "retry-pending") {
      state.retryRequest = state.pendingRetryRequest;
      return { control: "retry" };
    }
    return { control: "throw", error };
  }

  let choice;
  try {
    choice = await deps.promptRecoveryMenu(error, { input, output });
  } catch (menuError) {
    if (menuError?.name !== "AbortError") throw menuError;
    deps.terminalInput.setRawMode?.(false);
    deps.terminalInput.resume?.();
    deps.preserveReplHistory();
    deps.closeReadline();
    deps.setReadline(deps.createReadline());
    deps.writeSystem("Recovery cancelled; session preserved.");
    return { control: "end" };
  }

  const menuRecovery = deps.decideRecoveryMenuChoice(choice, state.recoveryAttempts);
  state.recoveryAttempts = menuRecovery.recoveryAttempts;
  if (menuRecovery.action === "retry" || menuRecovery.action === "debug-retry") {
    state.openai = await deps.recreateOpenAIClient(state.openai, createSessionClient);
    deps.setActiveOpenAI(state.openai);
    if (menuRecovery.action === "debug-retry" && !state.debugEnabled) {
      state.debugEnabled = true;
      deps.bindDebugListeners(state.openai);
      deps.writeDebugEnabled();
    }
    state.retryRequest = state.pendingRetryRequest;
    return { control: "retry" };
  }
  if (menuRecovery.action === "new-chain") {
    state.previousResponseId = "";
    state.retryRequest = null;
    state.pendingRetryRequest = null;
    return { control: "retry" };
  }
  if (menuRecovery.action === "rollback") {
    const selected = await deps.promptRollback(history, { input, output });
    if (selected) {
      deps.applyRollback(selected);
      await deps.saveState();
      await deps.persistCheckpoint(checkpointPath, selected);
    }
    return { control: "end" };
  }
  if (menuRecovery.action === "clear") {
    state.retryRequest = null;
    deps.resetState(deps.createUsageTotals());
    await deps.clearSession(statePath);
    deps.writeSystem("Session cleared");
  }
  return { control: "end" };
}
