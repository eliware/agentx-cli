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
}
