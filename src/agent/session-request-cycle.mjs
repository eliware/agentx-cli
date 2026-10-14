import { prepareSessionRequest } from "./session-request-preparation.mjs";
import { createSessionRequestOptions } from "./session-request-options.mjs";
import { runWithSessionRequestLifecycle } from "./session-request-lifecycle.mjs";
import { createSessionRequestCycleServices } from "./session-request-cycle-services.mjs";

export async function runSessionRequestCycle({
  message,
  requestMessage,
  sessionStartedAt,
  state,
  context,
  deps,
}) {
  const services = createSessionRequestCycleServices(deps);
  let response;
  while (!response) {
    const { requestTemplate, activeOverride } = prepareSessionRequest({
      context,
      state,
      requestMessage,
    });
    const attemptResult = await runWithSessionRequestLifecycle({
      context,
      attachListener: services.attachGoalInterruptListener,
      attempt: async () => {
        try {
          const callbacks = services.createRequestCallbacks({
            getOpenAI: context.getOpenAI,
            getSessionUsage: context.getSessionUsage,
            getPendingTransaction: context.getPendingTransaction,
            getPendingToolCalls: context.getPendingToolCalls,
            getExecutionJournal: context.getExecutionJournal,
            getGoal: context.getGoal,
            setGoal: context.setGoal,
            setPendingRetryRequest: context.setPendingRetryRequest,
            setPendingTransaction: context.setPendingTransaction,
            saveState: context.saveState,
            getReadline: context.getReadline,
            terminalInput: context.terminalInput,
            printFinalResponse: deps.printAgentText,
          });
          const response = await services.sendMessage(
            context.getOpenAI(),
            requestTemplate,
            state.previousResponseId,
            requestMessage,
            context.agentsText,
            context.getCwd(),
            callbacks.onResponseUsage,
            state.retryRequest || activeOverride,
            createSessionRequestOptions({ context, sessionStartedAt, callbacks, message }),
          );
          return { response };
        } catch (error) {
          const recovery = await services.resolveRequestFailure({
            error,
            state,
            oneShot: context.oneShot,
            history: context.getHistory(),
            statePath: context.statePath,
            checkpointPath: context.checkpointPath,
            input: context.terminalInput,
            output: context.terminalOutput,
            createSessionClient: context.createSessionClient,
            deps: context.recoveryDependencies,
          });
          return { recovery };
        }
      },
    });
    if (attemptResult.recovery) {
      if (attemptResult.recovery.control === "retry") continue;
      if (attemptResult.recovery.control === "throw") throw attemptResult.recovery.error;
      return { control: attemptResult.recovery.control, response: null };
    }
    response = attemptResult.response;
  }
  return { control: "response", response };
}
