export function createAgentRequestContext({
  state,
  cwd,
  oneShot,
  input,
  output,
  outputFlags,
  yoloEnabled,
  paths,
  createClient,
  repl,
  callbacks,
  recovery,
}) {
  return {
    oneShot,
    agentsText: state.agentsText,
    terminalInput: input,
    terminalOutput: output,
    outputFlags,
    yoloEnabled,
    statePath: paths.statePath,
    checkpointPath: paths.checkpointPath,
    createSessionClient: createClient,
    recoveryDependencies: recovery,
    getTemplate: () => state.runtime.template,
    getGoal: () => state.runtime.activeGoal,
    setGoal: (goal) => {
      state.runtime.activeGoal = goal;
    },
    getCwd: cwd,
    getOpenAI: () => state.runtime.openai,
    getSessionUsage: () => state.runtime.sessionUsage,
    getPendingTransaction: () => state.runtime.pendingTransaction,
    getPendingToolCalls: () => state.runtime.pendingToolCalls,
    getExecutionJournal: () => state.runtime.executionJournal,
    setPendingRetryRequest: (request) => {
      state.runtime.pendingRetryRequest = request;
    },
    setPendingTransaction: (transaction) => {
      state.runtime.pendingTransaction = transaction;
    },
    saveState: callbacks.saveState,
    getReadline: repl.getReadline,
    persistResponseSnapshot: callbacks.persistResponseSnapshot,
    persistToolExecutionState: callbacks.persistToolExecutionState,
    confirmToolCall: callbacks.confirmToolCall,
    getDebugEnabled: () => state.runtime.debugEnabled,
    runInteractiveToolCall: callbacks.runInteractiveToolCall,
    handleImageGeneration: callbacks.handleImageGeneration,
    onWorkerComplete: callbacks.onWorkerComplete,
    replaceReplInterface: repl.replace,
    getHistory: () => state.runtime.history,
  };
}
