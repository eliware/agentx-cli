import {
  applyResponseSnapshot,
  applyRollbackSelection,
  resetSessionState,
} from "./conversation-transitions.mjs";

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

  const persistToolExecutionState = async ({
    call,
    response,
    status,
    identity: suppliedIdentity,
  }) => {
    const state = getState();
    const identity = suppliedIdentity || `id:${String(call?.call_id || call?.id || "")}`;
    const record = {
      identity,
      status,
      response_id: String(response?.id || ""),
      updated_at: new Date().toISOString(),
    };
    setState({
      ...state,
      execution_journal: [
        ...(state.execution_journal || []).filter((entry) => entry.identity !== identity),
        record,
      ].slice(-100),
    });
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
    saveState,
    persistResponseSnapshot,
    persistToolExecutionState,
    resetState,
    applyRollback,
  };
}
