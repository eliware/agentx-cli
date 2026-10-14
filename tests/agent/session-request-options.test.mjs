import { describe, expect, test, jest } from "@jest/globals";
import { createSessionRequestOptions } from "../../src/agent/session-request-options.mjs";

describe("session request options", () => {
  test("maps session flags and goal callbacks", () => {
    const getGoal = jest.fn(() => ({ status: "active", text: "goal", iterations: 3 }));
    const context = {
      persistResponseSnapshot: jest.fn(),
      persistToolExecutionState: jest.fn(),
      confirmToolCall: jest.fn(),
      getDebugEnabled: () => false,
      outputFlags: {
        quiet: true,
        noUsage: true,
        noTimers: true,
        noColors: true,
        noReasoning: true,
        noShellCalls: true,
        noToolCalls: true,
        noMcpOutput: true,
        noWebsearch: true,
      },
      oneShot: false,
      terminalInput: { isTTY: true },
      runInteractiveToolCall: jest.fn(),
      handleImageGeneration: jest.fn(),
      yoloEnabled: true,
      onWorkerComplete: jest.fn(),
      getGoal,
    };
    const callback = jest.fn();
    const callbacks = {
      onRetryState: callback,
      onViewImage: callback,
      onWorkerUsage: callback,
      goalCallbacks: {
        onGoalIteration: callback,
        onGoalComplete: callback,
        onGoalFinalResponse: callback,
        onGoalBlocked: callback,
        onGoalLimit: callback,
      },
    };
    const options = createSessionRequestOptions({
      context,
      sessionStartedAt: 4,
      callbacks,
      message: "task",
    });
    expect(options).toMatchObject({
      sessionStartedAt: 4,
      suppressStatusOutput: true,
      goalMode: true,
      goalText: "goal",
      goalIterations: 3,
    });
    expect(options.isGoalCancelled()).toBe(false);
    getGoal.mockReturnValue({ status: "paused" });
    expect(options.isGoalCancelled()).toBe(true);
    context.getDebugEnabled = () => true;
    context.outputFlags = {
      quiet: false,
      noUsage: false,
      noTimers: false,
      noColors: false,
      noReasoning: false,
      noShellCalls: false,
      noToolCalls: false,
      noMcpOutput: false,
      noWebsearch: false,
    };
    context.oneShot = true;
    context.terminalInput = null;
    context.getGoal = () => null;
    const noGoalOptions = createSessionRequestOptions({
      context,
      sessionStartedAt: 5,
      callbacks,
      message: "fallback",
    });
    expect(noGoalOptions).toMatchObject({
      suppressStatusOutput: true,
      colors: true,
      transitionOnlyStatus: true,
      goalMode: false,
      goalText: "fallback",
      goalIterations: 0,
    });
    expect(noGoalOptions.isGoalCancelled()).toBe(true);
  });
});
