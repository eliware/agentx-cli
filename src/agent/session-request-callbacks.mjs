import { inspectImage as inspectImageDefault } from "../image-inspector.mjs";
import { addUsageTotals as addUsageTotalsDefault } from "../response.mjs";
import { createGoalCallbacks as createGoalCallbacksDefault } from "./goal-callbacks.mjs";

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

  const onViewImage = async ({ args, response, previousResponseId, baseRequest, cwd }) =>
    inspectImage(getOpenAI(), args, {
      cwd,
      responseId: response?.id,
      previousResponseId,
      callerResponse: response,
      model: baseRequest?.model,
      processWorker: true,
      onUsage: (usage) => {
        const totals = getSessionUsage();
        addUsageTotals(totals, usage);
        totals.turns += usage.turns || 1;
      },
    });

  const onWorkerUsage = (usage) => {
    const totals = getSessionUsage();
    addUsageTotals(totals, usage);
    totals.turns += usage.turns || 0;
  };

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
