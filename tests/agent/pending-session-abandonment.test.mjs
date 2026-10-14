import { expect, jest, test } from "@jest/globals";
import { abandonPendingSession } from "../../src/agent/pending-session-abandonment.mjs";

function dependencies() {
  return {
    createUsageTotals: jest.fn(() => ({ turns: 0 })),
    saveState: jest.fn(async () => {}),
    persistCheckpoint: jest.fn(async () => {}),
    resetState: jest.fn(),
    clearSession: jest.fn(async () => {}),
    writeSystem: jest.fn(),
  };
}

test("restores the latest checkpoint and clears pending state", async () => {
  const checkpoint = {
    response_id: "saved",
    last_user_message: "question",
    last_assistant_message: "answer",
    usage: { turns: 2 },
  };
  let nextState;
  const deps = dependencies();
  await abandonPendingSession(
    {
      pending_transaction: { request: {} },
      pending_tool_calls: [{ id: "call" }],
      history: [checkpoint],
    },
    (state) => (nextState = state),
    deps,
  );
  expect(nextState).toMatchObject({
    response_id: "saved",
    last_user_message: "question",
    pending_tool_calls: [],
    pending_transaction: null,
    pending_retry_request: null,
    failed_response: false,
  });
  expect(nextState.usage).toEqual({ turns: 2 });
  expect(nextState.usage).not.toBe(checkpoint.usage);
  expect(deps.persistCheckpoint).toHaveBeenCalledWith(checkpoint);
  expect(deps.saveState).toHaveBeenCalledTimes(1);
});

test("clears a new session without a pending transaction or checkpoint", async () => {
  const deps = dependencies();
  await abandonPendingSession({ pending_transaction: null, history: [] }, jest.fn(), deps);
  expect(deps.resetState).toHaveBeenCalledWith({ turns: 0 });
  expect(deps.clearSession).toHaveBeenCalledTimes(1);
  expect(deps.writeSystem).toHaveBeenCalledWith("Session cleared");
});
test("restores an empty state when pending work has no checkpoint", async () => {
  let nextState;
  const deps = dependencies();
  await abandonPendingSession(
    { pending_transaction: {}, history: [] },
    (state) => (nextState = state),
    deps,
  );
  expect(nextState.response_id).toBe("");
  expect(nextState.usage).toEqual({ turns: 0 });
  expect(deps.persistCheckpoint).not.toHaveBeenCalled();
});
