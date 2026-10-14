import { buildRequestOverride, withGoalTools, WORKER_ROLE_MESSAGE } from "../request-builder.mjs";

export function prepareSessionRequest({ context, state, requestMessage }) {
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
  return { requestTemplate, activeOverride };
}
