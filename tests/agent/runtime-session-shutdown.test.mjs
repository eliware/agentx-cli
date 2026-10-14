import { expect, jest, test } from "@jest/globals";
import { agentProcessLifecycle } from "../../src/agent/process-lifecycle.mjs";
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

test("uses the default runtime shutdown service", async () => {
  const oldTerminate = agentProcessLifecycle.terminateWorkers;
  const terminateWorkers = jest.fn(async () => {});
  const close = jest.fn(async () => {});
  const removeHandlers = jest.fn();
  agentProcessLifecycle.terminateWorkers = terminateWorkers;
  try {
    await shutdownAgentPromptSession({
      repl: { getReadline: () => ({ close: jest.fn() }) },
      openai: { responses: { close } },
      signalRegistration: { removeHandlers },
    });
    expect(close).toHaveBeenCalled();
    expect(terminateWorkers).toHaveBeenCalled();
    expect(removeHandlers).toHaveBeenCalled();
  } finally {
    agentProcessLifecycle.terminateWorkers = oldTerminate;
  }
});
