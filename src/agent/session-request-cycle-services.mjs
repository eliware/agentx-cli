import { sendMessage } from "../agent-turn/response-service.mjs";
import { createSessionRequestCallbacks } from "./session-request-callbacks.mjs";
import { attachGoalInterruptListener } from "./session-goal-interruption.mjs";
import { resolveSessionRequestFailure } from "./session-request-recovery.mjs";

export const sessionRequestCycleDefaults = {
  sendMessage,
  createRequestCallbacks: createSessionRequestCallbacks,
  attachGoalInterruptListener,
  resolveRequestFailure: resolveSessionRequestFailure,
};

export function createSessionRequestCycleServices(overrides = {}) {
  return { ...sessionRequestCycleDefaults, ...overrides };
}
