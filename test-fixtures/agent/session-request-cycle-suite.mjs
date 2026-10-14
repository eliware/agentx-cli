import { describe, expect, jest, test } from "@jest/globals";
import { runSessionRequestCycle } from "../../src/agent/session-request-cycle.mjs";

function createContext(overrides = {}) {
  const callbacks = {
    onResponseUsage: jest.fn(),
    onRetryState: jest.fn(),
    onViewImage: jest.fn(),
    onWorkerUsage: jest.fn(),
    goalCallbacks: {
      onGoalIteration: jest.fn(),
      onGoalComplete: jest.fn(),
      onGoalFinalResponse: jest.fn(),
      onGoalBlocked: jest.fn(),
      onGoalLimit: jest.fn(),
    },
  };
  const context = {
    oneShot: false,
    agentsText: "instructions",
    terminalInput: { isTTY: true },
    terminalOutput: {},
    outputFlags: { quiet: false, noUsage: false, noColors: false },
    yoloEnabled: true,
    statePath: "state.json",
    checkpointPath: "checkpoint.json",
    createSessionClient: jest.fn(),
    recoveryDependencies: {},
    getTemplate: () => ({ model: "gpt-6-luna" }),
    getGoal: () => null,
    setGoal: jest.fn(),
    getCwd: () => "C:/project",
    getOpenAI: () => ({ id: "client" }),
    getSessionUsage: () => ({ turns: 1 }),
    getPendingTransaction: () => null,
    getPendingToolCalls: () => [],
    getExecutionJournal: () => [],
    setPendingRetryRequest: jest.fn(),
    setPendingTransaction: jest.fn(),
    saveState: jest.fn(),
    getReadline: () => ({}),
    persistResponseSnapshot: jest.fn(),
    persistToolExecutionState: jest.fn(),
    confirmToolCall: jest.fn(),
    getDebugEnabled: () => false,
    runInteractiveToolCall: jest.fn(),
    handleImageGeneration: jest.fn(),
    onWorkerComplete: jest.fn(),
    replaceReplInterface: jest.fn(),
    getHistory: () => [],
    ...overrides,
  };
  return { context, callbacks };
}

function createServices(overrides = {}) {
  const detach = jest.fn();
  const attachGoalInterruptListener = jest.fn(() => detach);
  const createRequestCallbacks = jest.fn(() => ({
    onResponseUsage: jest.fn(),
    onRetryState: jest.fn(),
    onViewImage: jest.fn(),
    onWorkerUsage: jest.fn(),
    goalCallbacks: {
      onGoalIteration: jest.fn(),
      onGoalComplete: jest.fn(),
      onGoalFinalResponse: jest.fn(),
      onGoalBlocked: jest.fn(),
      onGoalLimit: jest.fn(),
    },
  }));
  return {
    detach,
    attachGoalInterruptListener,
    createRequestCallbacks,
    printAgentText: jest.fn(),
    sendMessage: jest.fn(async () => ({ id: "response-1" })),
    resolveRequestFailure: jest.fn(async () => ({ control: "end" })),
    ...overrides,
  };
}

describe("session request cycle", () => {
  test("builds request options, returns response, and removes request listeners", async () => {
    const { context } = createContext();
    const services = createServices();
    const state = { previousResponseId: "response-0", retryRequest: null };

    const result = await runSessionRequestCycle({
      message: "hello",
      requestMessage: "context\nhello",
      sessionStartedAt: 123,
      state,
      context,
      deps: services,
    });

    expect(result).toEqual({ control: "response", response: { id: "response-1" } });
    expect(services.sendMessage).toHaveBeenCalledWith(
      { id: "client" },
      { model: "gpt-6-luna", tools: [] },
      "response-0",
      "context\nhello",
      "instructions",
      "C:/project",
      expect.any(Function),
      expect.objectContaining({ previous_response_id: "response-0", input: expect.any(Array) }),
      expect.objectContaining({
        liveStreaming: true,
        sessionStartedAt: 123,
        confirmToolCall: context.confirmToolCall,
        runToolCall: context.runInteractiveToolCall,
      }),
    );
    expect(services.detach).toHaveBeenCalledTimes(1);
    expect(services.sendMessage.mock.calls[0][8].isGoalCancelled()).toBe(true);
  });

  test("retries after recovery requests another attempt and replaces the goal REPL", async () => {
    const goal = { status: "active", text: "finish task", iterations: 2 };
    const { context } = createContext({ getGoal: () => goal });
    const services = createServices({
      sendMessage: jest
        .fn()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce({ id: "response-2" }),
      resolveRequestFailure: jest.fn(async () => ({ control: "retry" })),
    });

    const result = await runSessionRequestCycle({
      message: "work",
      requestMessage: "work",
      sessionStartedAt: 456,
      state: { previousResponseId: "response-1", retryRequest: null },
      context,
      deps: services,
    });

    expect(result.response.id).toBe("response-2");
    expect(services.sendMessage).toHaveBeenCalledTimes(2);
    expect(services.resolveRequestFailure).toHaveBeenCalledTimes(1);
    expect(context.replaceReplInterface).toHaveBeenCalledTimes(2);
    expect(services.detach).toHaveBeenCalledTimes(2);
    expect(services.sendMessage.mock.calls[1][8].isGoalCancelled()).toBe(false);
  });

  test("returns a non-retry recovery control after cleanup", async () => {
    const { context } = createContext();
    const services = createServices({
      sendMessage: jest.fn(async () => {
        throw new Error("request failed");
      }),
    });
    services.resolveRequestFailure.mockResolvedValue({ control: "end" });

    await expect(
      runSessionRequestCycle({
        message: "work",
        requestMessage: "work",
        sessionStartedAt: 0,
        state: {},
        context,
        deps: services,
      }),
    ).resolves.toEqual({ control: "end", response: null });
    expect(services.detach).toHaveBeenCalledTimes(1);
  });

  test("rethrows errors when recovery returns throw control", async () => {
    const { context } = createContext();
    const error = new Error("request failed");
    const services = createServices({
      sendMessage: jest.fn(async () => {
        throw error;
      }),
    });
    services.resolveRequestFailure.mockResolvedValue({ control: "throw", error });

    await expect(
      runSessionRequestCycle({
        message: "work",
        requestMessage: "work",
        sessionStartedAt: 0,
        state: {},
        context,
        deps: services,
      }),
    ).rejects.toBe(error);
    expect(services.detach).toHaveBeenCalledTimes(1);
  });

  test("adds delegated-worker guidance only for one-shot workers with a worker ID", async () => {
    const originalWorkerId = process.env.AGENTX_WORKER_ID;
    try {
      delete process.env.AGENTX_WORKER_ID;
      const withoutId = createServices();
      await runSessionRequestCycle({
        message: "task",
        requestMessage: "task",
        sessionStartedAt: 1,
        state: { previousResponseId: "parent", retryRequest: null },
        context: createContext({ oneShot: true }).context,
        deps: withoutId,
      });
      expect(withoutId.sendMessage.mock.calls[0][7].input[0].role).toBe("user");

      process.env.AGENTX_WORKER_ID = "worker-1";
      const withId = createServices();
      await runSessionRequestCycle({
        message: "task",
        requestMessage: "task",
        sessionStartedAt: 2,
        state: { previousResponseId: "parent", retryRequest: null },
        context: createContext({ oneShot: true }).context,
        deps: withId,
      });
      expect(withId.sendMessage.mock.calls[0][7].input[0]).toMatchObject({ role: "developer" });
    } finally {
      if (originalWorkerId === undefined) delete process.env.AGENTX_WORKER_ID;
      else process.env.AGENTX_WORKER_ID = originalWorkerId;
    }
  });
});
