import { expect, jest, test } from "@jest/globals";
import { handleEmptyToolLoopCycle } from "../../src/agent-turn/tool-loop-empty-cycle.mjs";

test("returns the final response for a completed non-goal cycle", async () => {
  const response = { id: "r1" };
  const result = await handleEmptyToolLoopCycle({
    openai: {},
    current: response,
    goalMode: false,
    goalState: { finished: false, completionSnapshot: null },
    goalIterations: 0,
    goalMaxIterations: 5,
    streamOptions: { noTimers: true },
    statusController: null,
    sessionStartedAt: Date.now(),
    baseRequest: {},
    liveStreaming: false,
  });
  expect(result).toMatchObject({ done: true, response });
});

test("requests the next goal decision and reports the iteration limit", async () => {
  const current = { id: "goal-current" };
  const next = { id: "goal-next" };
  const createResponse = jest.fn().mockResolvedValue(next);
  const continued = await handleEmptyToolLoopCycle({
    openai: { responses: { create: createResponse } },
    current,
    goalMode: true,
    goalState: { finished: false, completionSnapshot: null },
    goalIterations: 1,
    goalMaxIterations: 3,
    streamOptions: { goalText: "goal" },
    statusController: null,
    sessionStartedAt: 0,
    baseRequest: {},
    liveStreaming: false,
  });
  expect(continued).toMatchObject({ done: false, response: next, goalIterations: 2 });
  const limited = await handleEmptyToolLoopCycle({
    openai: {},
    current,
    goalMode: true,
    goalState: { finished: false },
    goalIterations: 3,
    goalMaxIterations: 3,
    streamOptions: { goalText: "goal" },
    statusController: null,
    sessionStartedAt: 0,
    baseRequest: {},
    liveStreaming: false,
  });
  expect(limited).toEqual({ done: true, response: current, limited: true });
});
