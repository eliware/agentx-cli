import { expect, jest, test } from "@jest/globals";
import { shutdownAgentPromptSession } from "../../src/agent/runtime-session-shutdown.mjs";
import { agentProcessLifecycle } from "../../src/agent/process-lifecycle.mjs";

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

test("uses the default shutdown service", async () => {
  const oldTerminate = agentProcessLifecycle.terminateWorkers;
  agentProcessLifecycle.terminateWorkers = jest.fn(async () => {});
  try {
    await expect(
      shutdownAgentPromptSession({
        repl: { getReadline: () => ({ close: jest.fn() }) },
        openai: {},
        signalRegistration: {},
      }),
    ).resolves.toBeUndefined();
  } finally {
    agentProcessLifecycle.terminateWorkers = oldTerminate;
  }
});
