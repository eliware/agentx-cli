import { setActiveStatusController } from "../terminal-output.mjs";

export function initializeToolLoopLifecycle(
  statusController,
  setActive = setActiveStatusController,
) {
  setActive(statusController);
}

export function stopToolLoopForCancellation({
  goalMode,
  goalFinished,
  isGoalCancelled,
  statusController,
}) {
  if (!goalMode || goalFinished || !isGoalCancelled?.()) return false;
  statusController?.clear();
  return true;
}
