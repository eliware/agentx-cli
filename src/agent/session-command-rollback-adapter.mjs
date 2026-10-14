import { runSessionRollbackFlow } from "./session-rollback-flow.mjs";

export function createSessionCommandRollbackAdapter({ state, services, repl, context }) {
  return () =>
    runSessionRollbackFlow({
      history: state.getHistory(),
      readline: repl.getReadline(),
      preserveHistory: repl.preserveHistory,
      promptRollback: services.promptRollback,
      applyRollback: services.applyRollback,
      saveState: services.saveState,
      persistCheckpoint: services.persistCheckpoint,
      checkpointPath: context.checkpointPath,
      input: context.input,
      output: context.output,
      write: services.write,
      formatMessage: services.formatMessage,
      createReadline: repl.createReadline,
      setReadline: repl.setReadline,
    });
}
