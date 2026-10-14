import { expect, jest, test } from "@jest/globals";
import { resetPendingResponseSession } from "../../src/agent/session-pending-response-reset.mjs";

test("clears persisted session data after resetting runtime state", async () => {
  const order = [];
  const deps = {
    writeSystem: jest.fn((message) => order.push(message)),
    createUsageTotals: jest.fn(() => ({ turns: 0 })),
    resetState: jest.fn((state) => order.push(state)),
    clearSession: jest.fn(async () => order.push("cleared")),
  };
  await resetPendingResponseSession(deps);
  expect(order).toEqual(["Pending response not found; clearing session", { turns: 0 }, "cleared"]);
  expect(deps.resetState).toHaveBeenCalledWith({ turns: 0 });
  expect(deps.clearSession).toHaveBeenCalledTimes(1);
});
