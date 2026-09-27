import { getToolCallId } from "./pending-response.mjs";

function resumePolicy(choice) {
  if (choice === "auto-resume") return { mode: "auto", skipCalls: false };
  return { mode: choice === "interrupt-retry" ? "retry" : "request", skipCalls: true };
}

export async function resumePendingToolExecution({
  choice,
  savedState,
  pendingTransaction,
  createRunner,
  execute,
}) {
  const policy = resumePolicy(choice);
  const skippedCallIds = policy.skipCalls
    ? new Set(
        (savedState?.pending_tool_calls || []).map((call) => getToolCallId(call)).filter(Boolean),
      )
    : new Set();
  const uncertainIdentities = policy.skipCalls
    ? new Set(
        (savedState?.execution_journal || [])
          .filter((entry) => entry?.status === "started")
          .map((entry) => String(entry.identity || ""))
          .filter(Boolean),
      )
    : new Set();
  const runner = createRunner(policy.mode, skippedCallIds, uncertainIdentities);

  try {
    return { status: "completed", response: await execute(runner) };
  } catch (error) {
    return {
      status: error?.code === "previous_response_not_found" ? "missing-response" : "failed",
      error,
      preservePendingCalls: Boolean(pendingTransaction?.request),
    };
  }
}
