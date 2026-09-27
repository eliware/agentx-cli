import { parseInternalCommand } from "../shell-commands.mjs";
import { routeSessionCommand } from "./session-command-router.mjs";
import { runSessionSetupFlow } from "./session-setup-flow.mjs";
import { runSessionRollbackFlow } from "./session-rollback-flow.mjs";

export function createSessionCommandDispatcher({ state, context, repl, services }) {
  const commandState = {
    get activeGoal() {
      return state.getActiveGoal();
    },
    set activeGoal(value) {
      state.setActiveGoal(value);
    },
    get template() {
      return state.getTemplate();
    },
    set template(value) {
      state.setTemplate(value);
    },
    get cwd() {
      return state.getCwd();
    },
    set cwd(value) {
      state.setCwd(value);
    },
    get previousCwd() {
      return state.getPreviousCwd();
    },
    set previousCwd(value) {
      state.setPreviousCwd(value);
    },
    set cwdNote(value) {
      state.setCwdNote(value);
    },
  };

  return (message) =>
    routeSessionCommand({
      internal: parseInternalCommand(message),
      message,
      state: commandState,
      deps: {
        transitionGoalCommand: services.transitionGoalCommand,
        runSetupFlow: () =>
          runSessionSetupFlow({
            readline: repl.getReadline(),
            preserveHistory: repl.preserveHistory,
            runSetup: services.runSetup,
            reloadTemplate: async () =>
              services.applySettings(
                await services.loadPromptTemplate(context.promptPath, undefined, process.env, {
                  loadMcp: !context.outputFlags.noMcp,
                }),
                await services.reloadSettings(),
              ),
            write: services.write,
            formatMessage: services.formatMessage,
            printError: services.printError,
            createReadline: repl.createReadline,
            setReadline: repl.setReadline,
            input: context.input,
            output: context.output,
          }),
        saveState: services.saveState,
        writeSystem: services.writeSystem,
        exitWithSummary: services.exitWithSummary,
        noUsage: context.outputFlags.noUsage,
        printUsageReport: services.printUsageReport,
        getSessionUsage: state.getSessionUsage,
        resetState: services.resetState,
        createUsageTotals: services.createUsageTotals,
        clearSession: services.clearSession,
        statePath: context.statePath,
        runRollbackFlow: () =>
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
          }),
        resolveCdTarget: services.resolveCdTarget,
        buildWorkingDirectoryNote: services.buildWorkingDirectoryNote,
      },
    });
}
