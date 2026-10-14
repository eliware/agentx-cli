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
    statusController: {
      showExecuting: jest.fn(),
      updateExecuting: jest.fn(),
      clear: jest.fn(),
    },
  });
  expect(result).toMatchObject({ cancelled: true, response: { id: "r1" } });
});

test("continues a completed tool call and finalizes a finished goal", async () => {
  const create = jest.fn().mockResolvedValue({ id: "next" });
  const result = await executeToolLoopCycle({
    openai: { responses: { create } },
    calls: [{ type: "function_call", call_id: "c2", name: "agent_status", arguments: "{}" }],
    cwd: "/repo",
    currentResponse: { id: "current" },
    goalState: { finished: false },
    executeToolCall: jest.fn(async () => "done"),
    streamOptions: { suppressStatusOutput: true, suppressUsageOutput: true },
    statusController: {
      showExecuting: jest.fn(),
      updateExecuting: jest.fn(),
      clear: jest.fn(),
    },
  });
  expect(result).toMatchObject({ cancelled: false, response: { id: "next" } });
  expect(create).toHaveBeenCalled();

  const done = await executeToolLoopCycle({
    openai: { responses: { create: jest.fn().mockResolvedValue({ id: "final" }) } },
    calls: [{ type: "function_call", call_id: "c3", name: "agent_status", arguments: "{}" }],
    cwd: "/repo",
    currentResponse: { id: "current" },
    goalState: { finished: true, completionSnapshot: {} },
    executeToolCall: jest.fn(async () => "done"),
    streamOptions: { suppressStatusOutput: true, suppressUsageOutput: true },
    statusController: {
      showExecuting: jest.fn(),
      updateExecuting: jest.fn(),
      clear: jest.fn(),
    },
  });
  expect(done).toMatchObject({ cancelled: false, done: true, response: { id: "final" } });
});
