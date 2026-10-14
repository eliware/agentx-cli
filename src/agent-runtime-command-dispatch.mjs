import { createSessionCommandDispatcher } from "./agent/session-command-dispatcher.mjs";
import { transitionGoalCommand } from "./agent/goal-command-state.mjs";
import { runSetup } from "./setup.mjs";
import { applySettings, reloadSettings } from "./settings.mjs";
import { loadPromptTemplate } from "./prompt-loader.mjs";
import { writeTerminal } from "./terminal-output.mjs";
import { formatSystemMessage } from "./shell-display.mjs";
import { printAgentText, printUsageReport } from "./agent/repl.mjs";
import { createUsageTotals } from "./response.mjs";
import { clearSession } from "./conversation-state.mjs";
import { promptRollbackMenu } from "./rollback-menu.mjs";
import { resolveCdTarget, buildWorkingDirectoryNote } from "./shell-paths.mjs";

export function createAgentRuntimeCommandDispatcher({
  runtimeState,
  getCwd,
  setCwd,
  promptPath,
  outputFlags,
  input,
  output,
  statePath,
  checkpointPath,
  repl,
  saveState,
  exitWithSummary,
  resetState,
  applyRollback,
  persistCheckpoint,
  createDispatcher = createSessionCommandDispatcher,
}) {
  return createDispatcher({
    state: {
      getActiveGoal: () => runtimeState.activeGoal,
      setActiveGoal: (value) => {
        runtimeState.activeGoal = value;
      },
      getTemplate: () => runtimeState.template,
      setTemplate: (value) => {
        runtimeState.template = value;
      },
      getCwd,
      setCwd,
      getPreviousCwd: () => runtimeState.previousCwd,
      setPreviousCwd: (value) => {
        runtimeState.previousCwd = value;
      },
      setCwdNote: (value) => {
        runtimeState.cwdNote = value;
      },
      getSessionUsage: () => runtimeState.sessionUsage,
      getHistory: () => runtimeState.history,
    },
    context: { promptPath, outputFlags, input, output, statePath, checkpointPath },
    repl: {
      getReadline: repl.getReadline,
      preserveHistory: repl.preserveHistory,
      createReadline: repl.createReadline,
      setReadline: repl.setReadline,
    },
    services: {
      transitionGoalCommand,
      runSetup,
      applySettings,
      loadPromptTemplate,
      reloadSettings,
      write: writeTerminal,
      formatMessage: formatSystemMessage,
      printError: printAgentText,
      saveState,
      writeSystem: (text) => writeTerminal(`${formatSystemMessage(text)}\n`),
      exitWithSummary,
      printUsageReport,
      resetState,
      createUsageTotals,
      clearSession,
      promptRollback: promptRollbackMenu,
      applyRollback,
      persistCheckpoint: (checkpoint) => persistCheckpoint(checkpointPath, checkpoint),
      resolveCdTarget,
      buildWorkingDirectoryNote,
    },
  });
}
