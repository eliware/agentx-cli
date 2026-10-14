import { restorePendingSessionCheckpoint } from "./pending-session-abandonment-transition.mjs";

export async function abandonPendingSession(state, setState, deps) {
  if (!state.pending_transaction) {
    deps.resetState(deps.createUsageTotals());
    await deps.clearSession();
    deps.writeSystem("Session cleared");
    return;
  }

  const { state: restoredState, checkpoint } = restorePendingSessionCheckpoint(
    state,
    deps.createUsageTotals,
  );
  setState(restoredState);
  await deps.saveState();
  if (checkpoint) await deps.persistCheckpoint(checkpoint);
  deps.writeSystem("Interrupted work abandoned; returned to the last successful checkpoint.");
}
