process.env.AGENTX_RUNTIME_CASES = "11";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, jest, test } from "@jest/globals";
import { runAgentPromptSession } from "../../src/agent/runtime-prompt-session.mjs";

test("shuts down the session when the prompt loop fails", async () => {
  const failure = new Error("loop failed");
  const shutdown = jest.fn();
  await expect(
    runAgentPromptSession(
      { repl: { getReadline: () => null }, openai: {}, signalRegistration: null },
      {
        runLoop: async () => {
          throw failure;
        },
        shutdown,
      },
    ),
  ).rejects.toBe(failure);
  expect(shutdown).toHaveBeenCalledTimes(1);
});
