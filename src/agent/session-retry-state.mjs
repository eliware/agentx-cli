import { buildSessionRetryTransaction } from "./session-retry-transaction.mjs";

export async function persistSessionRetryState({
  request,
  response,
  getPendingTransaction,
  getPendingToolCalls,
  getExecutionJournal,
  setPendingRetryRequest,
  setPendingTransaction,
  saveState,
}) {
  setPendingRetryRequest(request);
  setPendingTransaction(
    buildSessionRetryTransaction({
      request,
      response,
      transaction: getPendingTransaction(),
      calls: getPendingToolCalls(),
      executionJournal: getExecutionJournal(),
    }),
  );
  await saveState();
}
