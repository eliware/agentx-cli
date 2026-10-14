import { expect, test } from "@jest/globals";
import { applyToolLoopTransition } from "../../src/agent-turn/tool-loop-transition.mjs";

test("updates response state and goal iteration after a goal continuation", () => {
  const state = {
    current: { id: "before" },
    currentPreviousResponseId: "old-parent",
    goalIterations: 2,
  };
  applyToolLoopTransition(state, {
    response: { id: "after" },
    previousResponseId: "new-parent",
    goalIterations: 3,
  });
  expect(state).toEqual({
    current: { id: "after" },
    currentPreviousResponseId: "new-parent",
    goalIterations: 3,
  });
});

test("keeps the goal iteration count after an ordinary tool cycle", () => {
  const state = { goalIterations: 2 };
  applyToolLoopTransition(state, {
    response: { id: "after" },
    previousResponseId: "new-parent",
  });
  expect(state).toEqual({
    current: { id: "after" },
    currentPreviousResponseId: "new-parent",
    goalIterations: 2,
  });
});
