import { describe, expect, jest, test } from "@jest/globals";
import { attachGoalInterruptListener } from "../../src/agent/session-goal-interruption.mjs";

describe("session goal interruption", () => {
  test("persists Ctrl-T cancellation and detaches the listener", () => {
    const listeners = new Map();
    const terminalInput = {
      setRawMode: jest.fn(),
      on: jest.fn((event, listener) => listeners.set(event, listener)),
      removeListener: jest.fn((event) => listeners.delete(event)),
    };
    let goal = { status: "active", text: "ship" };
    const saveState = jest.fn().mockResolvedValue(undefined);
    const detach = attachGoalInterruptListener({
      oneShot: false,
      terminalInput,
      getGoal: () => goal,
      setGoal: (next) => (goal = next),
      saveState,
      now: () => "timestamp",
    });
    const listener = listeners.get("data");
    listener("hello\x14world");
    expect(goal).toEqual({ status: "cancelled", text: "ship", cancelled_at: "timestamp" });
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(detach()).toBe(true);
    expect(terminalInput.removeListener).toHaveBeenCalledWith("data", listener);
    expect(terminalInput.setRawMode).toHaveBeenNthCalledWith(1, true);
    expect(terminalInput.setRawMode).toHaveBeenNthCalledWith(2, false);
  });

  test("ignores other input and skips inactive, absent, or one-shot listeners", () => {
    let listener;
    const terminalInput = {
      on: jest.fn((_event, callback) => (listener = callback)),
      removeListener: jest.fn(),
      setRawMode: jest.fn(),
    };
    const saveState = jest.fn();
    const detach = attachGoalInterruptListener({
      oneShot: false,
      terminalInput,
      getGoal: () => ({ status: "active" }),
      setGoal: jest.fn(),
      saveState,
    });
    listener("ordinary input");
    expect(detach()).toBe(false);
    expect(saveState).not.toHaveBeenCalled();
    expect(
      attachGoalInterruptListener({
        oneShot: false,
        terminalInput,
        getGoal: () => ({ status: "paused" }),
      })(),
    ).toBe(false);
    expect(
      attachGoalInterruptListener({
        oneShot: false,
        terminalInput: {},
        getGoal: () => ({ status: "active" }),
      })(),
    ).toBe(false);
    expect(
      attachGoalInterruptListener({
        oneShot: true,
        terminalInput,
        getGoal: () => ({ status: "active" }),
      })(),
    ).toBe(false);
    expect(terminalInput.on).toHaveBeenCalledTimes(1);
  });

  test("uses an ISO timestamp and tolerates a save failure", async () => {
    let listener;
    let goal = { status: "active" };
    const terminalInput = {
      on: jest.fn((_event, callback) => (listener = callback)),
      setRawMode: jest.fn(),
      removeListener: jest.fn(),
    };
    const saveState = jest.fn(() => Promise.reject(new Error("save failed")));
    const detach = attachGoalInterruptListener({
      oneShot: false,
      terminalInput,
      getGoal: () => goal,
      setGoal: (next) => (goal = next),
      saveState,
    });
    listener("\x14");
    await Promise.resolve();
    expect(goal.status).toBe("cancelled");
    expect(new Date(goal.cancelled_at).toISOString()).toBe(goal.cancelled_at);
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(detach()).toBe(true);
  });
});
