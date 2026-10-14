import { expect, jest, test } from "@jest/globals";
import { prepareSessionUserTurnState } from "../../src/agent/session-user-turn-state.mjs";

test("clears prior request state and records the new user turn", () => {
  const session = Object.fromEntries(
    [
      "CwdNote",
      "LastUserMessage",
      "PendingRetryRequest",
      "PendingTransaction",
      "PendingToolCalls",
      "FailedResponse",
    ].map((name) => [`set${name}`, jest.fn()]),
  );
  prepareSessionUserTurnState(session, "new question");
  expect(session.setCwdNote).toHaveBeenCalledWith("");
  expect(session.setLastUserMessage).toHaveBeenCalledWith("new question");
  expect(session.setPendingRetryRequest).toHaveBeenCalledWith(null);
  expect(session.setPendingTransaction).toHaveBeenCalledWith(null);
  expect(session.setPendingToolCalls).toHaveBeenCalledWith([]);
  expect(session.setFailedResponse).toHaveBeenCalledWith(false);
});
