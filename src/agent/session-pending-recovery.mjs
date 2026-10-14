import { resumePendingToolExecution } from "./pending-tool-resume.mjs";
import { abandonPendingSession } from "./pending-session-abandonment.mjs";
import { applyPendingRecoveryOutcome } from "./session-pending-outcome.mjs";

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
  if (resumeChoice === "new-session") {
    await abandonPendingSession(state, setState, deps);
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
  await applyPendingRecoveryOutcome({ result, state, setState, deps });
}
