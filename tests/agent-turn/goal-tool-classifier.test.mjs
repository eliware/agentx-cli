import { expect, test } from "@jest/globals";
import { isGoalToolCall } from "../../src/agent-turn/goal-tool-classifier.mjs";

test("recognizes only function calls that use goal tools", () => {
  expect(isGoalToolCall({ type: "function_call", name: "goal_update" })).toBe(true);
  expect(isGoalToolCall({ type: "function_call", name: "goal_blocked" })).toBe(true);
  expect(isGoalToolCall({ type: "shell_call", name: "goal_update" })).toBe(false);
  expect(isGoalToolCall({ type: "function_call", name: "other" })).toBe(false);
  expect(isGoalToolCall(undefined)).toBe(false);
});
