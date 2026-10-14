export async function applyPendingRecoveryOutcome({ result, state, setState, deps }) {
  if (result.status === "completed") {
    state = {
      ...state,
      response_id: result.response?.id || state.response_id,
      last_assistant_message: deps.extractAssistantText(result.response),
      pending_tool_calls: [],
    };
    setState(state);
    await deps.saveState();
  } else if (result.status === "missing-response") {
    deps.writeSystem("Pending response not found; clearing session");
    deps.resetState(deps.createUsageTotals());
    await deps.clearSession();
  } else {
    state = {
      ...state,
      failed_response: true,
      pending_tool_calls: result.preservePendingCalls ? state.pending_tool_calls : [],
    };
    setState(state);
    await deps.saveState();
    deps.writeSystem(
      `Pending response failed: ${result.error?.message || String(result.error)}. Session preserved.`,
    );
  }
}
