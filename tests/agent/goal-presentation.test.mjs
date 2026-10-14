import { expect, jest, test } from "@jest/globals";
import { createGoalPresentation } from "../../src/agent/goal-presentation.mjs";

test("formats goal limits and writes final responses", () => {
  const write = jest.fn();
  const presentation = createGoalPresentation({
    write,
    formatMessage: (text) => `[${text}]`,
  });
  presentation.onGoalLimit(8);
  presentation.onGoalFinalResponse("");
  presentation.onGoalFinalResponse("final answer");
  expect(write.mock.calls).toEqual([["[Goal stopped after 8 iterations]\n"], ["final answer"]]);
});

test("uses default formatting and writes final responses", () => {
  const write = jest.fn();
  const presentation = createGoalPresentation({ write });
  presentation.onGoalLimit(2);
  presentation.onGoalFinalResponse("response");
  expect(write).toHaveBeenNthCalledWith(
    1,
    expect.stringMatching(/Goal stopped after 2 iterations/),
  );
  expect(write).toHaveBeenNthCalledWith(2, "response");
});
