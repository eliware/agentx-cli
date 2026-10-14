import { describe, expect, jest, test } from "@jest/globals";
import { createGoalCallbacks } from "../../src/agent/goal-callbacks.mjs";

function makeCallbacks({
  goal = { status: "active", text: "ship it" },
  readline,
  terminalInput = {},
} = {}) {
  const state = { goal };
  const saved = jest.fn();
  const callbacks = createGoalCallbacks({
    getGoal: () => state.goal,
    setGoal: (value) => {
      state.goal = value;
    },
    saveState: saved,
    getReadline: () => readline,
    terminalInput,
    write: jest.fn(),
    formatMessage: (text) => `<${text}>`,
  });
  return { callbacks, state, saved };
}

describe("goal callbacks", () => {
  test("persists active iterations and ignores iteration updates after the goal stops", async () => {
    const active = makeCallbacks();
    await active.callbacks.onGoalIteration(3);
    expect(active.state.goal).toEqual({ status: "active", text: "ship it", iterations: 3 });
    expect(active.saved).toHaveBeenCalledTimes(1);

    const inactive = makeCallbacks({ goal: { status: "completed" } });
    await inactive.callbacks.onGoalIteration(4);
    expect(inactive.state.goal).toEqual({ status: "completed" });
    expect(inactive.saved).not.toHaveBeenCalled();
  });

  test("records completion result and timestamp", async () => {
    const { callbacks, state, saved } = makeCallbacks();
    await callbacks.onGoalComplete("done");
    expect(state.goal).toMatchObject({ status: "completed", result: "done" });
    expect(new Date(state.goal.completed_at).toISOString()).toBe(state.goal.completed_at);
    expect(saved).toHaveBeenCalledTimes(1);
  });

  test("blocks a goal at its iteration limit and only renders nonempty final responses", async () => {
    const { callbacks, state, saved } = makeCallbacks();
    await callbacks.onGoalLimit(8);
    expect(state.goal).toEqual({ status: "blocked", text: "ship it", iterations: 8 });
    expect(saved).toHaveBeenCalledTimes(1);

    const write = jest.fn();
    const finalCallbacks = createGoalCallbacks({
      getGoal: () => null,
      setGoal: jest.fn(),
      saveState: jest.fn(),
      getReadline: () => null,
      terminalInput: {},
      write,
    });
    await finalCallbacks.onGoalFinalResponse("");
    await finalCallbacks.onGoalFinalResponse("final");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("final");
  });
});
