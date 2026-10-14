process.env.AGENTX_RUNTIME_CASES = "12";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, jest, test } from "@jest/globals";
import { shutdownAgentPromptSession } from "../../src/agent/runtime-session-shutdown.mjs";

test("passes session resources to shutdown", async () => {
  const shutdown = jest.fn();
  const resources = {
    repl: { getReadline: () => "readline" },
    openai: "client",
    signalRegistration: "signals",
  };
  await shutdownAgentPromptSession(resources, shutdown);
  const shutdownOptions = shutdown.mock.calls[0][0];
  expect(shutdown).toHaveBeenCalledWith(
    expect.objectContaining({
      readline: "readline",
      client: "client",
      signalRegistration: "signals",
    }),
  );
  shutdownOptions.deps.restoreTerminalOutput();
});
