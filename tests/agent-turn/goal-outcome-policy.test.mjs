import { expect, test } from "@jest/globals";
import { selectGoalOutcome } from "../../src/agent-turn/goal-outcome-policy.mjs";

test("maps parsed question and goal methods to outcomes", () => {
  expect(selectGoalOutcome({ kind: "question", args: { question: "Proceed?" } })).toEqual({
    action: "ask",
    args: { question: "Proceed?" },
  });
  const args = { method: "complete" };
  expect(selectGoalOutcome({ kind: "method", args, method: "complete" })).toEqual({
    action: "complete",
    args,
  });
  expect(selectGoalOutcome({ kind: "method", method: "blocked" }, 7)).toEqual({
    action: "blocked",
    iterations: 7,
  });
  expect(selectGoalOutcome({ kind: "method", method: "incomplete" })).toEqual({
    action: "reply",
    output: "Continue working on the goal.",
  });
});

test("returns a validation reply for an invalid method", () => {
  expect(selectGoalOutcome({ kind: "invalid", method: "unknown" })).toEqual({
    action: "reply",
    output: 'Invalid goal_update method "unknown". Use complete, incomplete, or blocked.',
  });
  expect(selectGoalOutcome({ kind: "invalid", method: "" }).output).toContain('"(missing)"');
});
