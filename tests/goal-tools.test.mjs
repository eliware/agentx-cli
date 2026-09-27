import { describe, expect, jest, test } from "@jest/globals";
import { handleGoalToolCall, isGoalToolCall } from "../src/agent-turn/goal-tools.mjs";

describe("goal tool handlers", () => {
  test("recognizes only function calls using goal tools", () => {
    expect(isGoalToolCall({ type: "function_call", name: "goal_update" })).toBe(true);
    expect(isGoalToolCall({ type: "function_call", name: "goal_blocked" })).toBe(true);
    expect(isGoalToolCall({ type: "shell_call", name: "goal_update" })).toBe(false);
    expect(isGoalToolCall({ type: "function_call", name: "other" })).toBe(false);
    expect(isGoalToolCall(undefined)).toBe(false);
  });

  test("validates goal updates and keeps incomplete goals active", async () => {
    const goalState = { finished: false, completionSnapshot: null };
    const context = { goalState, goalIterations: 2, callbacks: {} };
    await expect(
      handleGoalToolCall({ name: "goal_update", arguments: "bad json" }, context),
    ).resolves.toContain('Invalid goal_update method "(missing)"');
    await expect(
      handleGoalToolCall({ name: "goal_update", arguments: '{"method":"unknown"}' }, context),
    ).resolves.toContain('Invalid goal_update method "unknown"');
    await expect(
      handleGoalToolCall({ name: "goal_update", arguments: '{"method":"incomplete"}' }, context),
    ).resolves.toBe("Continue working on the goal.");
    expect(goalState.finished).toBe(false);
  });

  test("pauses while asking for user input and always resumes", async () => {
    const statusController = { pause: jest.fn(), resume: jest.fn() };
    const onGoalBlocked = jest.fn().mockResolvedValue("continue");
    await expect(
      handleGoalToolCall(
        { name: "goal_blocked", arguments: '{"question":"Proceed?"}' },
        { goalState: {}, statusController, callbacks: { onGoalBlocked } },
      ),
    ).resolves.toBe("continue");
    expect(onGoalBlocked).toHaveBeenCalledWith({ question: "Proceed?" });
    expect(statusController.pause).toHaveBeenCalledTimes(1);
    expect(statusController.resume).toHaveBeenCalledWith({ renderNow: false });

    await expect(
      handleGoalToolCall({ name: "goal_blocked", input: "{}" }, { callbacks: {} }),
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

  test("records completion snapshot and acknowledges blocked goals", async () => {
    const snapshot = { time: "1s" };
    const statusController = { pause: jest.fn(), snapshot: jest.fn(() => snapshot) };
    const goalState = { finished: false, completionSnapshot: null };
    const onGoalComplete = jest.fn();
    await expect(
      handleGoalToolCall(
        { name: "goal_update", input: '{"method":"COMPLETE","summary":"done"}' },
        { goalState, statusController, callbacks: { onGoalComplete } },
      ),
    ).resolves.toBe("Goal complete acknowledged.");
    expect(goalState).toEqual({ finished: true, completionSnapshot: snapshot });
    expect(onGoalComplete).toHaveBeenCalledWith({ method: "COMPLETE", summary: "done" });

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
