import { describe, expect, jest, test } from "@jest/globals";
import { createGoalQuestionCallback } from "../../src/agent/goal-question-callback.mjs";

describe("goal question callback", () => {
  test("forwards the question, saves its text, and returns the answer", async () => {
    let goal = { status: "active", text: "ship" };
    const saveState = jest.fn();
    const ask = jest.fn().mockResolvedValue("B");
    const callback = createGoalQuestionCallback({
      getGoal: () => goal,
      setGoal: (next) => (goal = next),
      saveState,
      getReadline: jest.fn(),
      terminalInput: {},
      write: jest.fn(),
      formatMessage: jest.fn(),
      ask,
    });
    await expect(callback({ question: "Which?", choices: ["First", "Second"] })).resolves.toBe("B");
    expect(goal.last_question).toBe("Which?");
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith({
      question: "Which?",
      choices: ["First", "Second"],
      getReadline: expect.any(Function),
      terminalInput: {},
      write: expect.any(Function),
      formatMessage: expect.any(Function),
    });
  });

  test("stores a missing question and tolerates absent readline input", async () => {
    let goal = { status: "active" };
    const saveState = jest.fn();
    const ask = jest.fn().mockResolvedValue("");
    const callback = createGoalQuestionCallback({
      getGoal: () => goal,
      setGoal: (next) => (goal = next),
      saveState,
      getReadline: jest.fn(),
      terminalInput: {},
      write: jest.fn(),
      formatMessage: jest.fn(),
      ask,
    });
    await expect(callback({})).resolves.toBe("");
    expect(goal.last_question).toBeUndefined();
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: undefined, choices: [] }));
  });
});
