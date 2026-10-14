import { inspectImage as inspectImageDefault } from "../image-inspector.mjs";
import { addUsageTotals as addUsageTotalsDefault } from "../response.mjs";
import { createGoalCallbacks as createGoalCallbacksDefault } from "./goal-callbacks.mjs";
import { createSessionImageInspection } from "./session-image-inspection.mjs";
import { createSessionWorkerUsageCallback } from "./session-worker-usage-accounting.mjs";
import { persistSessionRetryState } from "./session-retry-state.mjs";

export function createSessionRequestCallbacks({
  getOpenAI,
  getSessionUsage,
  addUsageTotals = addUsageTotalsDefault,
  getPendingTransaction,
  getPendingToolCalls,
  getExecutionJournal,
  getGoal,
  setGoal,
  setPendingRetryRequest,
  setPendingTransaction,
  saveState,
  getReadline,
  terminalInput,
  printFinalResponse,
  inspectImage = inspectImageDefault,
  createGoalCallbacks = createGoalCallbacksDefault,
}) {
  const onResponseUsage = (usage, { skipIncrement = false } = {}) => {
    const totals = getSessionUsage();
    if (!skipIncrement) {
      addUsageTotals(totals, usage);
      totals.turns += 1;
    }
    return totals;
  };

  const onRetryState = (state) =>
    persistSessionRetryState({
      ...state,
      getPendingTransaction,
      getPendingToolCalls,
      getExecutionJournal,
      setPendingRetryRequest,
      setPendingTransaction,
      saveState,
    });

  const onViewImage = createSessionImageInspection({
    getOpenAI,
    getSessionUsage,
    addUsageTotals,
    inspectImage,
  });
  const onWorkerUsage = createSessionWorkerUsageCallback({ getSessionUsage, addUsageTotals });

  const goalCallbacks = createGoalCallbacks({
    getGoal,
    setGoal,
    saveState,
    getReadline,
    terminalInput,
    printFinalResponse,
  });

  return { onResponseUsage, onRetryState, onViewImage, onWorkerUsage, goalCallbacks };
}
