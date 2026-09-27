import { resumePendingToolExecution } from "./pending-tool-resume.mjs";

export function shouldRecoverPendingSession({ previousResponseId, pendingToolCalls, oneShot }) {
  return Boolean(previousResponseId && pendingToolCalls.length > 0 && !oneShot);
}

export async function recoverPendingSession({
  savedState,
  input,
  output,
  getState,
  setState,
  execute,
  deps,
}) {
  const resumeChoice = await deps.promptResumeMenu(savedState, { input, output });
  let state = getState();
  if (resumeChoice === "new-session" && state.pending_transaction) {
    const checkpoint = state.history.at(-1);
    state = {
      ...state,
      response_id: checkpoint?.response_id || "",
      last_user_message: checkpoint?.last_user_message || "",
      last_assistant_message: checkpoint?.last_assistant_message || "",
      usage: checkpoint?.usage ? { ...checkpoint.usage } : deps.createUsageTotals(),
      pending_tool_calls: [],
      pending_retry_request: null,
      pending_transaction: null,
      failed_response: false,
    };
    setState(state);
    await deps.saveState();
    if (checkpoint) await deps.persistCheckpoint(checkpoint);
    deps.writeSystem("Interrupted work abandoned; returned to the last successful checkpoint.");
    return;
  }
  if (resumeChoice === "new-session") {
    deps.resetState(deps.createUsageTotals());
    await deps.clearSession();
    deps.writeSystem("Session cleared");
    return;
  }

  deps.writeSystem(
    resumeChoice === "auto-resume"
      ? "Resuming pending tool execution"
      : resumeChoice === "interrupt-retry"
        ? "Resuming pending tool execution with retry hint"
        : "Resuming pending tool execution with interruption notice",
  );
  const result = await resumePendingToolExecution({
    choice: resumeChoice,
    savedState,
    pendingTransaction: state.pending_transaction,
    createRunner: deps.createRunner,
    execute,
  });
  state = getState();
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
