import { describe, expect, jest, test } from "@jest/globals";
import { createGoalQuestionCallback } from "../../src/agent/goal-question-callback.mjs";

describe("goal question callback", () => {
  test("asks the question, saves its text, and returns the answer", async () => {
    let goal = { status: "active", text: "ship" };
    const saveState = jest.fn();
    const readline = { question: jest.fn().mockResolvedValue("B") };
    const terminalInput = { setRawMode: jest.fn() };
    const writes = [];
    const callback = createGoalQuestionCallback({
      getGoal: () => goal,
      setGoal: (next) => (goal = next),
      saveState,
      getReadline: () => readline,
      terminalInput,
      write: (text) => writes.push(text),
      formatMessage: (text) => `<${text}>`,
    });
    await expect(callback({ question: "Which?", choices: ["First", "Second"] })).resolves.toBe("B");
    expect(goal.last_question).toBe("Which?");
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(terminalInput.setRawMode).toHaveBeenCalledWith(false);
    expect(readline.question).toHaveBeenCalledWith("Choose A-D or answer: ");
    expect(writes).toEqual(["<GOAL QUESTION: Which?>\n", "A) First\n", "B) Second\n"]);
  });

  test("stores a missing question and tolerates absent readline input", async () => {
    let goal = { status: "active" };
    const saveState = jest.fn();
    const writes = [];
    const callback = createGoalQuestionCallback({
      getGoal: () => goal,
      setGoal: (next) => (goal = next),
      saveState,
      getReadline: () => null,
      terminalInput: {},
      write: (text) => writes.push(text),
      formatMessage: (text) => text,
    });
    await expect(callback({})).resolves.toBe("");
    expect(goal.last_question).toBeUndefined();
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(["GOAL QUESTION: Input required\n"]);
  });

  test("passes all prompt dependencies to a supplied question handler", async () => {
    const goal = { status: "active" };
    const ask = jest.fn(async () => "answer");
    const deps = {
      getGoal: () => goal,
      setGoal: jest.fn(),
      saveState: jest.fn(),
      getReadline: jest.fn(),
      terminalInput: {},
      write: jest.fn(),
      formatMessage: jest.fn(),
      ask,
    };
    await expect(createGoalQuestionCallback(deps)({ question: "Q" })).resolves.toBe("answer");
    expect(ask).toHaveBeenCalledWith({
      question: "Q",
      choices: [],
      getReadline: deps.getReadline,
      terminalInput: deps.terminalInput,
      write: deps.write,
      formatMessage: deps.formatMessage,
    });
    expect(deps.setGoal).toHaveBeenCalledWith({ status: "active", last_question: "Q" });
    expect(deps.saveState).toHaveBeenCalledTimes(1);
  });
});
