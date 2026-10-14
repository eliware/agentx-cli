import { parseInternalCommand } from "../shell-commands.mjs";
import { routeSessionCommand } from "./session-command-router.mjs";
import { createSessionCommandSetupAdapter } from "./session-command-setup-adapter.mjs";
import { createSessionCommandRollbackAdapter } from "./session-command-rollback-adapter.mjs";

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

  const runSetupFlow = createSessionCommandSetupAdapter({ services, repl, context });
  const runRollbackFlow = createSessionCommandRollbackAdapter({ state, services, repl, context });

  return (message) =>
    routeSessionCommand({
      internal: parseInternalCommand(message),
      message,
      state: commandState,
      deps: {
        transitionGoalCommand: services.transitionGoalCommand,
        runSetupFlow,
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
        runRollbackFlow,
        resolveCdTarget: services.resolveCdTarget,
        buildWorkingDirectoryNote: services.buildWorkingDirectoryNote,
      },
    });
}
