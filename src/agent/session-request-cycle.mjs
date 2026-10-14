import { sendMessage } from "../agent-turn/response-service.mjs";
import { buildRequestOverride, withGoalTools, WORKER_ROLE_MESSAGE } from "../request-builder.mjs";
import { createSessionRequestCallbacks } from "./session-request-callbacks.mjs";
import { attachGoalInterruptListener } from "./session-goal-interruption.mjs";
import { resolveSessionRequestFailure } from "./session-request-recovery.mjs";
import { createSessionRequestOptions } from "./session-request-options.mjs";
import { runWithSessionRequestLifecycle } from "./session-request-lifecycle.mjs";

export async function runSessionRequestCycle({
  message,
  requestMessage,
  sessionStartedAt,
  state,
  context,
  deps,
}) {
  const services = { ...sessionRequestCycleDefaults, ...deps };
  let response;
  while (!response) {
    const workerRoleMessage =
      context.oneShot && process.env.AGENTX_WORKER_ID ? WORKER_ROLE_MESSAGE : "";
    const requestTemplate = withGoalTools(
      context.getTemplate(),
      context.getGoal()?.status === "active",
    );
    const activeOverride = buildRequestOverride(
      requestTemplate,
      requestMessage,
      context.agentsText,
      context.getCwd(),
      state.previousResponseId,
      workerRoleMessage,
    );
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

export const sessionRequestCycleDefaults = {
  sendMessage,
  createRequestCallbacks: createSessionRequestCallbacks,
  attachGoalInterruptListener,
  resolveRequestFailure: resolveSessionRequestFailure,
};
