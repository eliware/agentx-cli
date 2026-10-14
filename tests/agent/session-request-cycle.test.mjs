import { describe, expect, jest, test } from "@jest/globals";
import { runSessionRequestCycle } from "../../src/agent/session-request-cycle.mjs";
function createContext(overrides = {}) {
  return {
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
}
function createServices(overrides = {}) {
  const detach = jest.fn();
  const callbacks = () => ({
    onResponseUsage: jest.fn(),
    onRetryState: jest.fn(),
    onViewImage: jest.fn(),
    onWorkerUsage: jest.fn(),
    goalCallbacks: Object.fromEntries(
      ["Iteration", "Complete", "FinalResponse", "Blocked", "Limit"].map((name) => [
        `onGoal${name}`,
        jest.fn(),
      ]),
    ),
  });
  return {
    detach,
    attachGoalInterruptListener: jest.fn(() => detach),
    createRequestCallbacks: jest.fn(callbacks),
    printAgentText: jest.fn(),
    sendMessage: jest.fn(async () => ({ id: "response-1" })),
    resolveRequestFailure: jest.fn(async () => ({ control: "end" })),
    ...overrides,
  };
}
const runRequest = (context, deps, overrides = {}) =>
  runSessionRequestCycle({
    message: "work",
    requestMessage: "work",
    sessionStartedAt: 0,
    state: {},
    context,
    deps,
    ...overrides,
  });
describe("session request cycle", () => {
  test("passes the prepared request through one attempt and removes request listeners", async () => {
    const context = createContext();
    const services = createServices();
    const result = await runRequest(context, services, {
      message: "hello",
      requestMessage: "context\nhello",
      sessionStartedAt: 123,
      state: { previousResponseId: "response-0", retryRequest: null },
    });
    expect(result).toEqual({ control: "response", response: { id: "response-1" } });
    expect(services.sendMessage).toHaveBeenCalledTimes(1);
    expect(services.sendMessage.mock.calls[0][0]).toEqual({ id: "client" });
    expect(services.sendMessage.mock.calls[0][1]).toEqual(
      expect.objectContaining({ model: "gpt-6-luna" }),
    );
    expect(services.sendMessage.mock.calls[0][2]).toBe("response-0");
    expect(services.sendMessage.mock.calls[0][3]).toBe("context\nhello");
    expect(services.detach).toHaveBeenCalledTimes(1);
  });
  test("retries after recovery requests another attempt and replaces the goal REPL", async () => {
    const goal = { status: "active", text: "finish task", iterations: 2 };
    const context = createContext({ getGoal: () => goal });
    const services = createServices({
      sendMessage: jest
        .fn()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce({ id: "response-2" }),
      resolveRequestFailure: jest.fn(async () => ({ control: "retry" })),
    });
    const result = await runRequest(context, services, {
      message: "work",
      requestMessage: "work",
      sessionStartedAt: 456,
      state: { previousResponseId: "response-1", retryRequest: null },
    });
    expect(result.response.id).toBe("response-2");
    expect(services.sendMessage).toHaveBeenCalledTimes(2);
    expect(services.resolveRequestFailure).toHaveBeenCalledTimes(1);
    expect(context.replaceReplInterface).toHaveBeenCalledTimes(2);
  });
  test("returns a non-retry recovery control after cleanup", async () => {
    const context = createContext();
    const services = createServices({
      sendMessage: jest.fn(async () => {
        throw new Error("request failed");
      }),
    });
    services.resolveRequestFailure.mockResolvedValue({ control: "end" });
    await expect(runRequest(context, services)).resolves.toEqual({
      control: "end",
      response: null,
    });
    expect(services.detach).toHaveBeenCalledTimes(1);
  });
  test("rethrows errors when recovery returns throw control", async () => {
    const context = createContext();
    const error = new Error("request failed");
    const services = createServices({
      sendMessage: jest.fn(async () => {
        throw error;
      }),
    });
    services.resolveRequestFailure.mockResolvedValue({ control: "throw", error });
    await expect(runRequest(context, services)).rejects.toBe(error);
    expect(services.detach).toHaveBeenCalledTimes(1);
  });
});
