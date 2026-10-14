import { expect, jest, test } from "@jest/globals";
import { cancelActiveSessionGoal } from "../../src/agent/session-goal-cancellation.mjs";

test("cancels and persists an active goal", async () => {
  const goal = { status: "active", text: "ship" };
  const setGoal = jest.fn();
  const saveState = jest.fn();
  await expect(
    cancelActiveSessionGoal({ goal, setGoal, saveState, now: () => "timestamp" }),
  ).resolves.toBe(true);
  expect(setGoal).toHaveBeenCalledWith({
    ...goal,
    status: "cancelled",
    cancelled_at: "timestamp",
  });
  expect(saveState).toHaveBeenCalledTimes(1);
});

test("skips inactive goals and uses a default timestamp for active goals", async () => {
  const setGoal = jest.fn();
  const saveState = jest.fn();
  await expect(
    cancelActiveSessionGoal({ goal: { status: "paused" }, setGoal, saveState }),
  ).resolves.toBe(false);
  await cancelActiveSessionGoal({ goal: { status: "active" }, setGoal, saveState });
  expect(setGoal.mock.calls[0][0].cancelled_at).toEqual(expect.any(String));
  expect(saveState).toHaveBeenCalledTimes(1);
});
