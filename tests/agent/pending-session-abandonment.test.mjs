import { expect, jest, test } from "@jest/globals";
import { abandonPendingSession } from "../../src/agent/pending-session-abandonment.mjs";

function dependencies(order = []) {
  return {
    createUsageTotals: jest.fn(() => ({ turns: 0 })),
    saveState: jest.fn(async () => order.push("save")),
    persistCheckpoint: jest.fn(async () => order.push("checkpoint")),
    resetState: jest.fn(),
    clearSession: jest.fn(async () => order.push("clear")),
    writeSystem: jest.fn(),
  };
}

test("persists checkpoint restoration before reporting abandonment", async () => {
  const checkpoint = { response_id: "saved" };
  const order = [];
  const deps = dependencies(order);
  await abandonPendingSession(
    { pending_transaction: { request: {} }, history: [checkpoint] },
    jest.fn(),
    deps,
  );
  expect(order).toEqual(["save", "checkpoint"]);
  expect(deps.persistCheckpoint).toHaveBeenCalledWith(checkpoint);
  expect(deps.writeSystem).toHaveBeenCalledWith(
    "Interrupted work abandoned; returned to the last successful checkpoint.",
  );
});

test("clears a new session without a pending transaction or checkpoint", async () => {
  const deps = dependencies();
  await abandonPendingSession({ pending_transaction: null, history: [] }, jest.fn(), deps);
  expect(deps.resetState).toHaveBeenCalledWith({ turns: 0 });
  expect(deps.clearSession).toHaveBeenCalledTimes(1);
  expect(deps.writeSystem).toHaveBeenCalledWith("Session cleared");
});

test("does not persist a checkpoint when none exists", async () => {
  const deps = dependencies();
  await abandonPendingSession({ pending_transaction: {}, history: [] }, jest.fn(), deps);
  expect(deps.saveState).toHaveBeenCalledTimes(1);
  expect(deps.persistCheckpoint).not.toHaveBeenCalled();
});
