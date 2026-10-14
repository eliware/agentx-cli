import { expect, test, jest } from "@jest/globals";
import { executeToolLoopCycle } from "../../src/agent-turn/tool-loop-tool-cycle.mjs";

test("returns cancellation without requesting a continuation", async () => {
  const result = await executeToolLoopCycle({
    calls: [{ type: "function_call", call_id: "c1", name: "agent_status", arguments: "{}" }],
    currentResponse: { id: "r1" },
    goalState: { finished: false },
    goalMode: true,
    streamOptions: { isGoalCancelled: () => true },
    executeToolCall: jest.fn(),
    statusController: { showExecuting: jest.fn(), clear: jest.fn() },
  });
  expect(result).toMatchObject({ cancelled: true, response: { id: "r1" } });
});
