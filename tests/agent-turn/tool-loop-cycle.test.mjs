import { expect, test } from "@jest/globals";
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
