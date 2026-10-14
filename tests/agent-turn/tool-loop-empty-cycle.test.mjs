import { expect, test } from "@jest/globals";
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
