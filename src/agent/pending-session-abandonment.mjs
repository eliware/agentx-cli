export async function abandonPendingSession(state, setState, deps) {
  if (!state.pending_transaction) {
    deps.resetState(deps.createUsageTotals());
    await deps.clearSession();
    deps.writeSystem("Session cleared");
    return;
  }

  const checkpoint = state.history.at(-1);
  setState({
    ...state,
    response_id: checkpoint?.response_id || "",
    last_user_message: checkpoint?.last_user_message || "",
    last_assistant_message: checkpoint?.last_assistant_message || "",
    usage: checkpoint?.usage ? { ...checkpoint.usage } : deps.createUsageTotals(),
    pending_tool_calls: [],
    pending_retry_request: null,
    pending_transaction: null,
    failed_response: false,
  });
  await deps.saveState();
  if (checkpoint) await deps.persistCheckpoint(checkpoint);
  deps.writeSystem("Interrupted work abandoned; returned to the last successful checkpoint.");
}
