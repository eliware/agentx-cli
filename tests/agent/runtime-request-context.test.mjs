import { expect, jest, test } from "@jest/globals";
import { createAgentRequestContext } from "../../src/agent/runtime-request-context.mjs";

test("exposes request services and live runtime state", async () => {
  const runtime = {
    template: "template",
    activeGoal: null,
    openai: "client",
    sessionUsage: { turns: 1 },
    pendingTransaction: null,
    pendingToolCalls: [],
    executionJournal: [],
    debugEnabled: false,
    history: [],
  };
  const state = { runtime, agentsText: "rules" };
  const callbacks = Object.fromEntries(
    [
      "saveState",
      "persistResponseSnapshot",
      "persistToolExecutionState",
      "confirmToolCall",
      "runInteractiveToolCall",
      "handleImageGeneration",
      "onWorkerComplete",
    ].map((name) => [name, jest.fn()]),
  );
  const repl = { getReadline: jest.fn(), replace: jest.fn() };
  const context = createAgentRequestContext({
    state,
    cwd: jest.fn(() => "/work"),
    oneShot: true,
    input: "input",
    output: "output",
    outputFlags: {},
    yoloEnabled: false,
    paths: { statePath: "state", checkpointPath: "checkpoint" },
    createClient: jest.fn(),
    repl,
    callbacks,
    recovery: { writeSystem: jest.fn() },
  });
  expect(context).toMatchObject({
    oneShot: true,
    agentsText: "rules",
    terminalInput: "input",
    terminalOutput: "output",
    statePath: "state",
    checkpointPath: "checkpoint",
    recoveryDependencies: expect.any(Object),
  });
  expect(context.getTemplate()).toBe("template");
  expect(context.getGoal()).toBeNull();
  context.setGoal("goal");
  expect(context.getGoal()).toBe("goal");
  expect(context.getCwd()).toBe("/work");
  expect(context.getOpenAI()).toBe("client");
  expect(context.getSessionUsage()).toBe(runtime.sessionUsage);
  expect(context.getPendingTransaction()).toBeNull();
  expect(context.getPendingToolCalls()).toEqual([]);
  expect(context.getExecutionJournal()).toEqual([]);
  context.setPendingRetryRequest("retry");
  context.setPendingTransaction("transaction");
  expect(runtime).toMatchObject({
    pendingRetryRequest: "retry",
    pendingTransaction: "transaction",
  });
  expect(context.getReadline).toBe(repl.getReadline);
  expect(context.persistResponseSnapshot).toBe(callbacks.persistResponseSnapshot);
  expect(context.persistToolExecutionState).toBe(callbacks.persistToolExecutionState);
  expect(context.confirmToolCall).toBe(callbacks.confirmToolCall);
  expect(context.runInteractiveToolCall).toBe(callbacks.runInteractiveToolCall);
  expect(context.handleImageGeneration).toBe(callbacks.handleImageGeneration);
  expect(context.onWorkerComplete).toBe(callbacks.onWorkerComplete);
  expect(context.replaceReplInterface).toBe(repl.replace);
  expect(context.getHistory()).toBe(runtime.history);
  expect(context.getDebugEnabled()).toBe(false);
  await context.saveState();
  expect(callbacks.saveState).toHaveBeenCalledTimes(1);
});
