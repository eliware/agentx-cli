import { transitionPendingRecoveryState } from "./session-pending-outcome-transition.mjs";

export async function applyPendingRecoveryOutcome({ result, state, setState, deps }) {
  if (result.status === "missing-response") {
    deps.writeSystem("Pending response not found; clearing session");
    deps.resetState(deps.createUsageTotals());
    await deps.clearSession();
  } else {
    setState(transitionPendingRecoveryState(result, state, deps.extractAssistantText));
    await deps.saveState();
    if (result.status !== "completed")
      deps.writeSystem(
        `Pending response failed: ${result.error?.message || String(result.error)}. Session preserved.`,
      );
  }
}
