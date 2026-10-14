import { describe, expect, test } from "@jest/globals";
import { isGoalToolCall, parseGoalToolCall } from "../../src/agent-turn/goal-tools.mjs";

describe("goal tool parsing and outcomes", () => {
  test("recognizes only function calls using goal tools", () => {
    expect(isGoalToolCall({ type: "function_call", name: "goal_update" })).toBe(true);
    expect(isGoalToolCall({ type: "function_call", name: "goal_blocked" })).toBe(true);
    expect(isGoalToolCall({ type: "shell_call", name: "goal_update" })).toBe(false);
    expect(isGoalToolCall({ type: "function_call", name: "other" })).toBe(false);
    expect(isGoalToolCall(undefined)).toBe(false);
  });

  test("parses invalid and incomplete goal updates", () => {
    expect(parseGoalToolCall({ name: "goal_update", arguments: "bad json" })).toMatchObject({
      action: "reply",
      output: 'Invalid goal_update method "(missing)". Use complete, incomplete, or blocked.',
    });
    expect(
      parseGoalToolCall({ name: "goal_update", arguments: '{"method":"unknown"}' }).output,
    ).toContain('Invalid goal_update method "unknown"');
    expect(
      parseGoalToolCall({ name: "goal_update", arguments: '{"method":"incomplete"}' }),
    ).toEqual({ action: "reply", output: "Continue working on the goal." });
  });

  test("maps question, completion, and blocked methods to effects", () => {
    expect(parseGoalToolCall({ name: "goal_blocked", input: '{"question":"Proceed?"}' })).toEqual({
      action: "ask",
      args: { question: "Proceed?" },
    });
    expect(parseGoalToolCall({ name: "goal_update", input: '{"method":"COMPLETE"}' })).toEqual({
      action: "complete",
      args: { method: "COMPLETE" },
    });
    expect(
      parseGoalToolCall(
        { name: "goal_update", arguments: '{"method":"blocked"}' },
        {
          goalIterations: 7,
        },
      ),
    ).toEqual({ action: "blocked", iterations: 7 });
  });
});
