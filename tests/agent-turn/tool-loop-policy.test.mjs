import { expect, jest, test } from "@jest/globals";
import {
  initializeToolLoopLifecycle,
  isToolLoopCancellation,
  stopToolLoopForCancellation,
} from "../../src/agent-turn/tool-loop-policy.mjs";

test("registers the active status controller", () => {
  const setActive = jest.fn();
  const controller = {};
  initializeToolLoopLifecycle(controller, setActive);
  expect(setActive).toHaveBeenCalledWith(controller);
});

test("stops and clears only when an active goal is cancelled", () => {
  const clear = jest.fn();
  expect(
    stopToolLoopForCancellation({
      goalMode: true,
      goalFinished: false,
      isGoalCancelled: () => true,
      statusController: { clear },
    }),
  ).toBe(true);
  expect(clear).toHaveBeenCalledTimes(1);
  expect(
    stopToolLoopForCancellation({
      goalMode: false,
      goalFinished: false,
      isGoalCancelled: () => true,
    }),
  ).toBe(false);
  expect(
    stopToolLoopForCancellation({
      goalMode: true,
      goalFinished: true,
      isGoalCancelled: () => true,
    }),
  ).toBe(false);
});

test("resolves cancellation reported after a tool cycle", () => {
  expect(isToolLoopCancellation({ cycleCancelled: true })).toBe(true);
  expect(isToolLoopCancellation({ cycleCancelled: false, goalMode: false })).toBe(false);
});
