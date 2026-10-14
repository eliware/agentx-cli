import { describe, expect, jest, test } from "@jest/globals";
import { handleGoalToolCall } from "../../src/agent-turn/goal-tool-handler.mjs";

describe("goal tool effect handler", () => {
  test("returns parser feedback without running effects", async () => {
    await expect(
      handleGoalToolCall(
        { name: "goal_update", arguments: "bad json" },
        { goalState: {}, callbacks: {} },
      ),
    ).resolves.toContain('Invalid goal_update method "(missing)"');
  });

  test("pauses while asking for user input and always resumes", async () => {
    const statusController = { pause: jest.fn(), resume: jest.fn() };
    const onGoalBlocked = jest.fn().mockResolvedValue("continue");
    await expect(
      handleGoalToolCall(
        { name: "goal_blocked", arguments: '{"question":"Proceed?"}' },
        { statusController, callbacks: { onGoalBlocked } },
      ),
    ).resolves.toBe("continue");
    expect(onGoalBlocked).toHaveBeenCalledWith({ question: "Proceed?" });
    expect(statusController.pause).toHaveBeenCalledTimes(1);
    expect(statusController.resume).toHaveBeenCalledWith({ renderNow: false });
  });

  test("uses the fallback answer and resumes after callback failure", async () => {
    const statusController = { pause: jest.fn(), resume: jest.fn() };
    await expect(
      handleGoalToolCall(
        { name: "goal_blocked", input: "{}" },
        {
          statusController,
          callbacks: {},
        },
      ),
    ).resolves.toBe("Continue without user input.");
    await expect(
      handleGoalToolCall(
        { name: "goal_blocked" },
        {
          statusController,
          callbacks: {
            onGoalBlocked: async () => {
              throw new Error("callback failed");
            },
          },
        },
      ),
    ).rejects.toThrow("callback failed");
    expect(statusController.resume).toHaveBeenCalledTimes(2);
  });

  test("applies completion and blocked effects in order", async () => {
    const snapshot = { time: "1s" };
    const statusController = { pause: jest.fn(), snapshot: jest.fn(() => snapshot) };
    const goalState = { finished: false, completionSnapshot: null };
    const onGoalComplete = jest.fn();
    await expect(
      handleGoalToolCall(
        { name: "goal_update", input: '{"method":"complete","summary":"done"}' },
        { goalState, statusController, callbacks: { onGoalComplete } },
      ),
    ).resolves.toBe("Goal complete acknowledged.");
    expect(goalState).toEqual({ finished: true, completionSnapshot: snapshot });
    expect(onGoalComplete).toHaveBeenCalledWith({ method: "complete", summary: "done" });

    const blockedState = { finished: false };
    const onGoalLimit = jest.fn();
    await expect(
      handleGoalToolCall(
        { name: "goal_update", arguments: '{"method":"blocked"}' },
        { goalState: blockedState, goalIterations: 7, callbacks: { onGoalLimit } },
      ),
    ).resolves.toBe("Goal marked blocked.");
    expect(blockedState.finished).toBe(true);
    expect(onGoalLimit).toHaveBeenCalledWith(7);
  });
});
