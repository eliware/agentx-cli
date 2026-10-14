import { sendMessage } from "../agent-turn/response-service.mjs";
import { buildRequestOverride, withGoalTools, WORKER_ROLE_MESSAGE } from "../request-builder.mjs";
import { createSessionRequestCallbacks } from "./session-request-callbacks.mjs";
import { attachGoalInterruptListener } from "./session-input.mjs";
import { resolveSessionRequestFailure } from "./session-request-recovery.mjs";
import { createSessionRequestOptions } from "./session-request-options.mjs";

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
    const goalRequestActive = context.getGoal()?.status === "active";
    const detachGoalInterrupt = services.attachGoalInterruptListener({
      oneShot: context.oneShot,
      terminalInput: context.terminalInput,
      getGoal: context.getGoal,
      setGoal: context.setGoal,
      saveState: context.saveState,
    });
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
      response = await services.sendMessage(
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
      if (recovery.control === "retry") continue;
      if (recovery.control === "throw") throw recovery.error;
      return { control: recovery.control, response: null };
    } finally {
      detachGoalInterrupt();
      if (goalRequestActive) context.replaceReplInterface();
    }
  }
  return { control: "response", response };
}

export const sessionRequestCycleDefaults = {
  sendMessage,
  createRequestCallbacks: createSessionRequestCallbacks,
  attachGoalInterruptListener,
  resolveRequestFailure: resolveSessionRequestFailure,
};
