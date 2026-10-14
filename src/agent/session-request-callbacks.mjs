import { inspectImage as inspectImageDefault } from "../image-inspector.mjs";
import { addUsageTotals as addUsageTotalsDefault } from "../response.mjs";
import { createGoalCallbacks as createGoalCallbacksDefault } from "./goal-callbacks.mjs";
import { createSessionImageInspection } from "./session-image-inspection.mjs";
import { createSessionWorkerUsageCallback } from "./session-worker-usage-accounting.mjs";

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

  const onRetryState = async ({ request, response }) => {
    setPendingRetryRequest(request);
    const transaction = getPendingTransaction();
    setPendingTransaction({
      ...transaction,
      base_response_id: response?.id || transaction?.base_response_id || "",
      request,
      calls: getPendingToolCalls(),
      outputs: request?.input || [],
      execution_journal: getExecutionJournal(),
      attempt_count: Number(transaction?.attempt_count || 0) + 1,
    });
    await saveState();
  };

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
