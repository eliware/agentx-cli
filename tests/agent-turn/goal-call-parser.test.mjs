import { expect, test } from "@jest/globals";
import { goalCallOutput, parseGoalCall } from "../../src/agent-turn/goal-call-parser.mjs";

test("returns the goal payload for interrupted call recovery", () => {
  expect(goalCallOutput({ input: "done" })).toBe("done");
  expect(goalCallOutput({ arguments: "done" })).toBe("done");
  expect(goalCallOutput({})).toBe("{}");
});

test("parses JSON arguments and reads the alternate input field", () => {
  expect(parseGoalCall({ arguments: '{"method":"COMPLETE"}' })).toEqual({
    kind: "method",
    args: { method: "COMPLETE" },
    method: "complete",
  });
  expect(parseGoalCall({ name: "goal_blocked", input: '{"question":"Proceed?"}' })).toEqual({
    kind: "question",
    args: { question: "Proceed?" },
  });
});

test("returns empty arguments after invalid JSON and classifies methods", () => {
  expect(parseGoalCall({ name: "goal_update", arguments: "bad json" })).toEqual({
    kind: "invalid",
    method: "",
  });
  expect(parseGoalCall({ name: "goal_update", arguments: '{"method":"unknown"}' })).toEqual({
    kind: "invalid",
    method: "unknown",
  });
  expect(parseGoalCall({ name: "goal_update", input: '{"method":"blocked"}' })).toMatchObject({
    kind: "method",
    method: "blocked",
  });
});
