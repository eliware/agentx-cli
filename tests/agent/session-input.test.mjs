import { describe, expect, jest, test } from "@jest/globals";
import {
  attachGoalInterruptListener,
  prepareSessionInput,
} from "../../src/agent/session-input.mjs";

describe("session input", () => {
  test.each([
    [true, true],
    [false, false],
  ])("does not prepare terminal input in oneShot=%s, isTTY=%s mode", (oneShot, isTTY) => {
    const terminalInput = { isTTY, setRawMode: jest.fn(), resume: jest.fn() };
    prepareSessionInput({ oneShot, terminalInput });
    expect(terminalInput.setRawMode).not.toHaveBeenCalled();
    expect(terminalInput.resume).not.toHaveBeenCalled();
  });

  test("prepares interactive TTY input", () => {
    const terminalInput = { isTTY: true, setRawMode: jest.fn(), resume: jest.fn() };
    prepareSessionInput({ oneShot: false, terminalInput });
    expect(terminalInput.setRawMode).toHaveBeenCalledWith(true);
    expect(terminalInput.resume).toHaveBeenCalledTimes(1);
  });

  test("attaches, persists Ctrl-T cancellation, and detaches the goal listener", () => {
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
      setGoal: (next) => {
        goal = next;
      },
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

  test("ignores unrelated input and skips listeners outside active interactive goals", () => {
    let listener;
    const terminalInput = {
      on: jest.fn((_event, callback) => {
        listener = callback;
      }),
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

    const inactive = attachGoalInterruptListener({
      oneShot: false,
      terminalInput,
      getGoal: () => ({ status: "paused" }),
      setGoal: jest.fn(),
      saveState,
    });
    expect(inactive()).toBe(false);
    expect(terminalInput.on).toHaveBeenCalledTimes(1);

    const missingListener = attachGoalInterruptListener({
      oneShot: false,
      terminalInput: {},
      getGoal: () => ({ status: "active" }),
      setGoal: jest.fn(),
      saveState,
    });
    expect(missingListener()).toBe(false);
  });

  test("does not attach the interruption listener in one-shot mode", () => {
    const terminalInput = { on: jest.fn(), setRawMode: jest.fn() };
    const detach = attachGoalInterruptListener({
      oneShot: true,
      terminalInput,
      getGoal: () => ({ status: "active" }),
      setGoal: jest.fn(),
      saveState: jest.fn(),
    });
    expect(detach()).toBe(false);
    expect(terminalInput.on).not.toHaveBeenCalled();
  });

  test("uses the default timestamp and tolerates cancellation persistence failure", async () => {
    let listener;
    let goal = { status: "active" };
    const terminalInput = {
      on: jest.fn((_event, callback) => {
        listener = callback;
      }),
      setRawMode: jest.fn(),
      removeListener: jest.fn(),
    };
    const saveState = jest.fn(() => Promise.reject(new Error("save failed")));
    const detach = attachGoalInterruptListener({
      oneShot: false,
      terminalInput,
      getGoal: () => goal,
      setGoal: (next) => {
        goal = next;
      },
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
