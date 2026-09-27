import { describe, expect, jest, test } from "@jest/globals";
import { createSessionRequestCallbacks } from "../../src/agent/session-request-callbacks.mjs";

function makeCallbacks(overrides = {}) {
  const usage = { inputTokens: 1, cachedTokens: 0, outputTokens: 2, turns: 0 };
  const values = {
    pendingRetryRequest: null,
    pendingTransaction: { attempt_count: 2 },
    pendingToolCalls: [{ call_id: "tool-1" }],
    executionJournal: [{ identity: "shell:test" }],
    goal: { status: "active", text: "ship" },
  };
  const setters = Object.fromEntries(
    ["pendingRetryRequest", "pendingTransaction", "goal"].map((key) => [
      key,
      jest.fn((value) => {
        values[key] = value;
      }),
    ]),
  );
  const addUsageTotals = jest.fn((totals, delta) => {
    totals.inputTokens += delta.inputTokens || 0;
    totals.cachedTokens += delta.cachedTokens || 0;
    totals.outputTokens += delta.outputTokens || 0;
    return totals;
  });
  const inspectImage = jest.fn(async (_openai, _args, options) => {
    options.onUsage({ inputTokens: 3, cachedTokens: 1, outputTokens: 4, turns: 2 });
    return "inspected";
  });
  const saveState = jest.fn();
  const goalCallbacksFactory = jest.fn((options) => ({ options }));
  const callbacks = createSessionRequestCallbacks({
    getOpenAI: () => "client",
    getSessionUsage: () => usage,
    addUsageTotals,
    getPendingTransaction: () => values.pendingTransaction,
    getPendingToolCalls: () => values.pendingToolCalls,
    getExecutionJournal: () => values.executionJournal,
    getGoal: () => values.goal,
    setGoal: setters.goal,
    setPendingRetryRequest: setters.pendingRetryRequest,
    setPendingTransaction: setters.pendingTransaction,
    saveState,
    getReadline: () => "readline",
    terminalInput: "stdin",
    printFinalResponse: "print",
    inspectImage,
    createGoalCallbacks: goalCallbacksFactory,
    ...overrides,
  });
  return {
    callbacks,
    usage,
    values,
    setters,
    addUsageTotals,
    inspectImage,
    saveState,
    goalCallbacksFactory,
  };
}

describe("session request callbacks", () => {
  test("accounts normal response usage and honors retry skip-increment", () => {
    const { callbacks, usage, addUsageTotals } = makeCallbacks();
    expect(callbacks.onResponseUsage({ inputTokens: 2 })).toBe(usage);
    expect(callbacks.onResponseUsage({ outputTokens: 3 }, { skipIncrement: true })).toBe(usage);
    expect(addUsageTotals).toHaveBeenCalledTimes(1);
    expect(usage).toMatchObject({ inputTokens: 3, turns: 1 });
  });

  test("persists retry request and transaction context", async () => {
    const state = makeCallbacks();
    await state.callbacks.onRetryState({
      request: { input: ["result"] },
      response: { id: "response-1" },
    });
    expect(state.setters.pendingRetryRequest).toHaveBeenCalledWith({ input: ["result"] });
    expect(state.values.pendingTransaction).toEqual({
      attempt_count: 3,
      base_response_id: "response-1",
      request: { input: ["result"] },
      calls: [{ call_id: "tool-1" }],
      outputs: ["result"],
      execution_journal: [{ identity: "shell:test" }],
    });
    expect(state.saveState).toHaveBeenCalledTimes(1);
  });

  test("inspects images with caller response identity and accounts branch usage", async () => {
    const state = makeCallbacks();
    await expect(
      state.callbacks.onViewImage({
        args: { images: [] },
        response: { id: "caller" },
        previousResponseId: "previous",
        baseRequest: { model: "model" },
        cwd: "/work",
      }),
    ).resolves.toBe("inspected");
    expect(state.inspectImage).toHaveBeenCalledWith(
      "client",
      { images: [] },
      expect.objectContaining({
        cwd: "/work",
        responseId: "caller",
        previousResponseId: "previous",
        callerResponse: { id: "caller" },
        model: "model",
        processWorker: true,
      }),
    );
    expect(state.usage).toMatchObject({
      inputTokens: 4,
      cachedTokens: 1,
      outputTokens: 6,
      turns: 2,
    });
  });

  test("accounts image and worker usage and creates goal callbacks with live state accessors", () => {
    const state = makeCallbacks();
    state.callbacks.onWorkerUsage({ inputTokens: 5, cachedTokens: 2, outputTokens: 7, turns: 3 });
    expect(state.usage).toMatchObject({
      inputTokens: 6,
      cachedTokens: 2,
      outputTokens: 9,
      turns: 3,
    });
    expect(state.goalCallbacksFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        getGoal: expect.any(Function),
        setGoal: state.setters.goal,
        getReadline: expect.any(Function),
        terminalInput: "stdin",
        printFinalResponse: "print",
      }),
    );
    const goalCallbacks = state.goalCallbacksFactory.mock.calls[0][0];
    expect(goalCallbacks.getGoal()).toBe(state.values.goal);
    goalCallbacks.setGoal({ status: "completed" });
    expect(state.values.goal).toEqual({ status: "completed" });
  });

  test("uses default usage and goal callback services", () => {
    const state = makeCallbacks({
      addUsageTotals: undefined,
      inspectImage: undefined,
      createGoalCallbacks: undefined,
    });
    state.callbacks.onResponseUsage({ inputTokens: 4, outputTokens: 6 });
    expect(state.usage).toMatchObject({ inputTokens: 5, outputTokens: 8, turns: 1 });
    expect(state.callbacks.goalCallbacks).toEqual(
      expect.objectContaining({ onGoalIteration: expect.any(Function) }),
    );
  });

  test("uses empty retry defaults and zero-or-missing usage turn fallbacks", async () => {
    const state = makeCallbacks({
      inspectImage: jest.fn(async (_client, _args, options) => {
        options.onUsage({ inputTokens: 1, cachedTokens: 0, outputTokens: 0 });
        return "inspected";
      }),
    });
    state.values.pendingTransaction = undefined;
    await state.callbacks.onRetryState({ request: null, response: null });
    expect(state.values.pendingTransaction).toEqual({
      base_response_id: "",
      request: null,
      calls: [{ call_id: "tool-1" }],
      outputs: [],
      execution_journal: [{ identity: "shell:test" }],
      attempt_count: 1,
    });

    await state.callbacks.onViewImage({ args: {}, response: null, baseRequest: null, cwd: "." });
    expect(state.usage.turns).toBe(1);
    state.callbacks.onWorkerUsage({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(state.usage.turns).toBe(1);
  });
});
