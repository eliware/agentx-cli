import { applyResponseSnapshot, resetSessionState } from "./conversation-transitions.mjs";
import { applyRollbackSelection } from "./rollback-transition.mjs";
import { updateExecutionJournal } from "./execution-journal.mjs";

export function createSessionPersistence({
  statePath,
  checkpointPath,
  oneShot = false,
  getState,
  setState,
  persistResponseState,
  persistCheckpoint,
  extractAssistantText = () => "",
}) {
  const saveState = async () => persistResponseState(statePath, getState());

  const persistResponseSnapshot = async (snapshot) => {
    const transition = applyResponseSnapshot(getState(), snapshot, {
      assistantText: extractAssistantText(snapshot?.response),
      oneShot,
    });
    setState(transition.state);
    await saveState();
    if (transition.checkpoint) await persistCheckpoint(checkpointPath, transition.checkpoint);
  };

  const persistToolExecutionState = async ({ call, response, status, identity }) => {
    setState(updateExecutionJournal(getState(), { call, response, status, identity }));
    await saveState();
  };

  const resetState = (emptyUsage) => {
    const state = resetSessionState(getState(), emptyUsage);
    setState(state);
    return state;
  };

  const applyRollback = (selected) => {
    const state = applyRollbackSelection(getState(), selected);
    setState(state);
    return state;
  };

  return {
    getState,
    setState,
    saveState,
    persistResponseSnapshot,
    persistToolExecutionState,
    resetState,
    applyRollback,
  };
}
