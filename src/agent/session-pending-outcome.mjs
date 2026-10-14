import { transitionPendingRecoveryState } from "./session-pending-outcome-transition.mjs";
import { resetPendingResponseSession } from "./session-pending-response-reset.mjs";

export async function applyPendingRecoveryOutcome({ result, state, setState, deps }) {
  if (result.status === "missing-response") {
    await resetPendingResponseSession(deps);
  } else {
    setState(transitionPendingRecoveryState(result, state, deps.extractAssistantText));
    await deps.saveState();
    if (result.status !== "completed")
      deps.writeSystem(
        `Pending response failed: ${result.error?.message || String(result.error)}. Session preserved.`,
      );
  }
}
