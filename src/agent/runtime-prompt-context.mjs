export function createRuntimePromptContext({
  runtimeState,
  oneShot,
  initialMessage,
  terminalInput,
  cwd,
  repl,
  saveState,
  exitWithSummary,
  dispatchCommand,
  userTurnSession,
  openai,
  signalRegistration,
}) {
  return {
    oneShot,
    initialMessage,
    terminalInput,
    cwd,
    repl,
    getActiveGoal: () => runtimeState.activeGoal,
    setActiveGoal: (goal) => {
      runtimeState.activeGoal = goal;
    },
    saveState,
    exitWithSummary,
    getPendingCliTranscript: () => runtimeState.pendingCliTranscript,
    setPendingCliTranscript: (value) => {
      runtimeState.pendingCliTranscript = value;
    },
    dispatchCommand,
    userTurnSession,
    openai,
    signalRegistration,
  };
}
