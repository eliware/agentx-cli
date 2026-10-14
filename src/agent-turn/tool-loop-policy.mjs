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
  if (!isToolLoopCancellation({ goalMode, goalFinished, isGoalCancelled })) return false;
  statusController?.clear();
  return true;
}

export function isToolLoopCancellation({
  cycleCancelled = false,
  goalMode,
  goalFinished,
  isGoalCancelled,
}) {
  return Boolean(cycleCancelled || (goalMode && !goalFinished && isGoalCancelled?.()));
}

export function shouldStopAfterToolCycle(result, state, streamOptions) {
  return isToolLoopCancellation({
    cycleCancelled: result.cancelled,
    goalMode: state.goalMode,
    goalFinished: state.goalState.finished,
    isGoalCancelled: streamOptions?.isGoalCancelled,
  });
}
