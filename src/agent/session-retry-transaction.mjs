export function buildSessionRetryTransaction({
  request,
  response,
  transaction,
  calls,
  executionJournal,
}) {
  return {
    ...transaction,
    base_response_id: response?.id || transaction?.base_response_id || "",
    request,
    calls,
    outputs: request?.input || [],
    execution_journal: executionJournal,
    attempt_count: Number(transaction?.attempt_count || 0) + 1,
  };
}
