import { expect, test } from "@jest/globals";
import { shouldRecoverPendingSession } from "../../src/agent/session-pending-recovery-policy.mjs";

test.each([
  [{ previousResponseId: "response", pendingToolCalls: [{}], oneShot: false }, true],
  [{ previousResponseId: "", pendingToolCalls: [{}], oneShot: false }, false],
  [{ previousResponseId: "response", pendingToolCalls: [], oneShot: false }, false],
  [{ previousResponseId: "response", pendingToolCalls: [{}], oneShot: true }, false],
])("selects interactive pending recovery: %j", (input, expected) => {
  expect(shouldRecoverPendingSession(input)).toBe(expected);
});
