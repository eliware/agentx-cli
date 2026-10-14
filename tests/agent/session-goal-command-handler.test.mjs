import { expect, jest, test } from "@jest/globals";
import { applySessionGoalCommand } from "../../src/agent/session-goal-command-handler.mjs";

test("applies and persists a goal transition with its system message", async () => {
  const state = { activeGoal: null };
  const saveState = jest.fn();
  const writeSystem = jest.fn();
  await expect(
    applySessionGoalCommand({
      state,
      internal: { type: "goal" },
      transitionGoalCommand: () => ({
        handled: true,
        goal: { status: "active" },
        persist: true,
        message: "Goal started",
        inputMessage: "do work",
        continue: false,
      }),
      saveState,
      writeSystem,
    }),
  ).resolves.toEqual({ handled: true, continue: false, inputMessage: "do work" });
  expect(state.activeGoal).toEqual({ status: "active" });
  expect(saveState).toHaveBeenCalledTimes(1);
  expect(writeSystem).toHaveBeenCalledWith("Goal started");
});

test("passes unhandled commands through without side effects", async () => {
  const state = { activeGoal: null };
  const saveState = jest.fn();
  const writeSystem = jest.fn();
  await expect(
    applySessionGoalCommand({
      state,
      internal: { type: "help" },
      transitionGoalCommand: () => ({ handled: false, goal: null }),
      saveState,
      writeSystem,
    }),
  ).resolves.toEqual({ handled: false, goal: null });
  expect(saveState).not.toHaveBeenCalled();
  expect(writeSystem).not.toHaveBeenCalled();
});
