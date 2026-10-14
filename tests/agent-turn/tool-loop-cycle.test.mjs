import { expect, jest, test } from "@jest/globals";
import { prepareToolLoopCycle } from "../../src/agent-turn/tool-loop-cycle.mjs";

test("prepares a cycle with deduplicated tool calls", async () => {
  const response = {
    id: "r1",
    output: [{ type: "function_call", name: "agent_status", call_id: "c1", arguments: "{}" }],
  };
  const result = await prepareToolLoopCycle({
    current: response,
    cwd: process.cwd(),
    streamOptions: { suppressUsageOutput: true },
    isFirstResponse: true,
    skipInitialUsageAccounting: false,
    goalMode: false,
    baseRequest: {},
  });
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].call_id).toBe("c1");
});

test("accounts for image output, goal calls, and response state", async () => {
  const image = { type: "image_generation_call", result: "data" };
  const goal = {
    type: "function_call",
    name: "goal_update",
    call_id: "goal-1",
    arguments: '{"method":"complete"}',
  };
  const onImageGeneration = jest.fn();
  const onResponseState = jest.fn();
  const response = { id: "r2", output: [image, goal] };
  const result = await prepareToolLoopCycle({
    current: response,
    cwd: "/repo",
    streamOptions: { onImageGeneration, suppressUsageOutput: true },
    isFirstResponse: false,
    skipInitialUsageAccounting: true,
    goalMode: true,
    onResponseState,
    onResponseUsage: jest.fn(),
    baseRequest: { model: "test" },
  });
  expect(onImageGeneration).toHaveBeenCalledWith({ item: image, response, cwd: "/repo" });
  expect(result.calls).toEqual([goal]);
  expect(onResponseState).toHaveBeenCalledWith(
    expect.objectContaining({ response, pendingToolCalls: [goal], isInitialResponse: false }),
  );
});

test("accepts a response without output and skips first response accounting", async () => {
  const onResponseState = jest.fn();
  const result = await prepareToolLoopCycle({
    current: {},
    cwd: "/repo",
    streamOptions: {},
    isFirstResponse: true,
    skipInitialUsageAccounting: true,
    goalMode: false,
    onResponseState,
    baseRequest: {},
  });
  expect(result.calls).toEqual([]);
  expect(onResponseState).toHaveBeenCalledWith(
    expect.objectContaining({ pendingToolCalls: [], cumulativeUsage: null }),
  );
});

test("ignores unrelated function calls outside goal mode", async () => {
  const result = await prepareToolLoopCycle({
    current: { output: [{ type: "function_call", name: "lookup", call_id: "ignored" }] },
    cwd: "/repo",
    streamOptions: { suppressUsageOutput: true },
    isFirstResponse: false,
    skipInitialUsageAccounting: false,
    goalMode: false,
    baseRequest: {},
  });
  expect(result.calls).toEqual([]);
});
