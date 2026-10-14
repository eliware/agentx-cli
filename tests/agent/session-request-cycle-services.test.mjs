import { expect, test } from "@jest/globals";
import {
  createSessionRequestCycleServices,
  sessionRequestCycleDefaults,
} from "../../src/agent/session-request-cycle-services.mjs";

test("selects default collaborators and applies caller overrides", () => {
  const sendMessage = () => {};
  const services = createSessionRequestCycleServices({ sendMessage });
  expect(services).toEqual({ ...sessionRequestCycleDefaults, sendMessage });
  expect(services.createRequestCallbacks).toBe(sessionRequestCycleDefaults.createRequestCallbacks);
  expect(services.attachGoalInterruptListener).toBe(
    sessionRequestCycleDefaults.attachGoalInterruptListener,
  );
  expect(services.resolveRequestFailure).toBe(sessionRequestCycleDefaults.resolveRequestFailure);
});

test("uses the defaults when no override object is supplied", () => {
  expect(createSessionRequestCycleServices()).toEqual(sessionRequestCycleDefaults);
});
