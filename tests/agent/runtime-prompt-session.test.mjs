process.env.AGENTX_RUNTIME_CASES = "11";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, jest, test } from "@jest/globals";
import { runAgentPromptSession } from "../../src/agent/runtime-prompt-session.mjs";

test("shuts down the session when the prompt loop fails", async () => {
  const failure = new Error("loop failed");
  const shutdown = jest.fn();
  const terminalInput = { isTTY: true, setRawMode: jest.fn() };
  await expect(
    runAgentPromptSession(
      { repl: { getReadline: () => null }, openai: {}, terminalInput, signalRegistration: null },
      {
        runLoop: async () => {
          throw failure;
        },
        shutdown,
      },
    ),
  ).rejects.toBe(failure);
  expect(shutdown).toHaveBeenCalledTimes(1);
  expect(terminalInput.setRawMode).toHaveBeenCalledWith(false);
});

test("reads the current goal when the prompt aborts", async () => {
  let goal = { status: "active" };
  const exitWithSummary = jest.fn(async () => {});
  const context = {
    repl: { getReadline: () => null },
    openai: {},
    getActiveGoal: () => goal,
    setActiveGoal: (value) => {
      goal = value;
    },
    exitWithSummary,
  };
  const abort = Object.assign(new Error("abort"), { name: "AbortError" });
  await runAgentPromptSession(context, {
    runLoop: async ({ handlePromptError }) => {
      context.setActiveGoal({ status: "cancelled" });
      await handlePromptError(abort);
    },
    shutdown: jest.fn(),
  });
  expect(goal).toEqual({ status: "cancelled" });
  expect(exitWithSummary).toHaveBeenCalledWith({ leadingNewline: true });
});
