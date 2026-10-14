import { expect, jest, test } from "@jest/globals";
import { createToolLoopState } from "../../src/agent-turn/tool-loop-state.mjs";

test("builds default state from the current response", () => {
  const response = { id: "r1" };
  const state = createToolLoopState({ response, baseRequest: {} });
  expect(state).toMatchObject({
    current: response,
    currentPreviousResponseId: "",
    liveStreaming: false,
    statusController: null,
    skipInitialUsageAccounting: false,
    goalMode: false,
    goalIterations: 0,
    goalMaxIterations: 50,
  });
});

test("creates status state and applies goal and tool options", () => {
  const statusController = { clear: jest.fn() };
  const runToolCallFn = jest.fn();
  const state = createToolLoopState({
    response: { id: "r2" },
    baseRequest: { previous_response_id: "prior" },
    runToolCallFn,
    streamOptions: {
      liveStreaming: true,
      suppressStatusOutput: true,
      statusController,
      onResponseState: jest.fn(),
      skipInitialUsageAccounting: true,
      goalMode: true,
      goalIterations: "4",
      goalMaxIterations: "8",
      runToolCall: jest.fn(),
    },
  });
  expect(state).toMatchObject({
    currentPreviousResponseId: "prior",
    liveStreaming: true,
    statusController,
    skipInitialUsageAccounting: true,
    goalMode: true,
    goalIterations: 4,
    goalMaxIterations: 8,
  });
  expect(state.executeToolCall).not.toBe(runToolCallFn);
  expect(state.onResponseState).toEqual(expect.any(Function));
});

test("creates a quiet status controller for live streams without an override", () => {
  const state = createToolLoopState({
    response: {},
    baseRequest: {},
    streamOptions: { liveStreaming: true, noTimers: true, colors: false },
  });
  expect(state.statusController).toBeDefined();
});
