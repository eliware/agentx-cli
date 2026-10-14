import { inspectImage as inspectImageDefault } from "../image-inspector.mjs";
import { addUsageTotals as addUsageTotalsDefault } from "../response.mjs";
import { createGoalCallbacks as createGoalCallbacksDefault } from "./goal-callbacks.mjs";
import { createSessionImageInspection } from "./session-image-inspection.mjs";
import { createSessionUsageCallbacks } from "./session-usage-accounting.mjs";
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
  const usageCallbacks = createSessionUsageCallbacks({ getSessionUsage, addUsageTotals });

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
  const goalCallbacks = createGoalCallbacks({
    getGoal,
    setGoal,
    saveState,
    getReadline,
    terminalInput,
    printFinalResponse,
  });

  return {
    ...usageCallbacks,
    onRetryState,
    onViewImage,
    goalCallbacks,
  };
}
