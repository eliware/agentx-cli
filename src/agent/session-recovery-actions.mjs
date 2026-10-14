import { prepareSessionRetryClient } from "../retry-recovery.mjs";

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
    const prepareRetryClient = deps.prepareRetryClient || prepareSessionRetryClient;
    await prepareRetryClient({ state, action, createSessionClient, deps });
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
