import { createInteractiveToolCallRunner } from "./interactive-tool-call.mjs";
import { createAgentRuntimeCommandDispatcher } from "../agent-runtime-command-dispatch.mjs";

export function createAgentRuntimeCommandServices({ options, persistCheckpoint }) {
  const {
    oneShot,
    terminalInput,
    repl,
    runtimeState,
    promptPath,
    outputFlags,
    terminalOutput,
    statePath,
    checkpointPath,
    getCwd,
    setCwd,
    saveState,
    exitWithSummary,
    resetState,
    applyRollback,
  } = options;
  const runInteractiveToolCall = createInteractiveToolCallRunner({
    oneShot,
    terminalInput,
    preserveHistory: repl.preserveHistory,
    closeReadline: repl.close,
    replaceReadline: repl.replace,
  });

  const dispatchCommand = createAgentRuntimeCommandDispatcher({
    runtimeState,
    getCwd,
    setCwd,
    promptPath,
    outputFlags,
    input: terminalInput,
    output: terminalOutput,
    statePath,
    checkpointPath,
    repl,
    saveState,
    exitWithSummary,
    resetState,
    applyRollback,
    persistCheckpoint: (checkpoint) => persistCheckpoint(checkpointPath, checkpoint),
  });
  return { dispatchCommand, runInteractiveToolCall };
}
