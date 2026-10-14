import { describe, expect, jest, test } from "@jest/globals";
import { askGoalQuestion } from "../../src/agent/goal-question.mjs";

describe("goal question prompt", () => {
  test("leaves raw mode, renders choices, and returns the answer", async () => {
    const write = jest.fn();
    const readline = { question: jest.fn().mockResolvedValue("B") };
    const terminalInput = { setRawMode: jest.fn() };
    await expect(
      askGoalQuestion({
        question: "Which?",
        choices: ["First", "Second"],
        getReadline: () => readline,
        terminalInput,
        write,
        formatMessage: (message) => `<${message}>`,
      }),
    ).resolves.toBe("B");
    expect(terminalInput.setRawMode).toHaveBeenCalledWith(false);
    expect(write.mock.calls.map(([text]) => text)).toEqual([
      "<GOAL QUESTION: Which?>\n",
      "A) First\n",
      "B) Second\n",
    ]);
    expect(readline.question).toHaveBeenCalledWith("Choose A-D or answer: ");
  });

  test("uses plain input when choices or readline are absent", async () => {
    const readline = { question: jest.fn().mockResolvedValue("text") };
    await expect(
      askGoalQuestion({
        getReadline: () => readline,
        terminalInput: {},
        write: jest.fn(),
        formatMessage: (message) => message,
      }),
    ).resolves.toBe("text");
    expect(readline.question).toHaveBeenCalledWith("Answer: ");
    await expect(
      askGoalQuestion({
        question: "Need input",
        getReadline: () => null,
        terminalInput: {},
        write: jest.fn(),
        formatMessage: (message) => message,
      }),
    ).resolves.toBe("");
  });

  test("uses default terminal output and message formatting", async () => {
    const output = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await askGoalQuestion({
        question: "Need input",
        getReadline: () => null,
        terminalInput: {},
      });
      expect(output).toHaveBeenCalled();
    } finally {
      output.mockRestore();
    }
  });
});
