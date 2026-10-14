import { resumePendingToolExecution } from "./pending-tool-resume.mjs";
import { abandonPendingSession } from "./pending-session-abandonment.mjs";
import { applyPendingRecoveryOutcome } from "./session-pending-outcome.mjs";
import { resolvePendingSessionChoice } from "./session-pending-choice.mjs";

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
  const choice = resolvePendingSessionChoice(resumeChoice);
  if (choice.action === "abandon") {
    await abandonPendingSession(state, setState, deps);
    return;
  }

  deps.writeSystem(choice.notice);
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
