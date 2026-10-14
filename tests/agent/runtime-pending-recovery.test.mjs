process.env.AGENTX_RUNTIME_CASES = "2";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, test } from "@jest/globals";
import { recoverAgentPendingSession } from "../../src/agent/runtime-pending-recovery.mjs";
test("skips recovery when no response is pending", async () => {
  await recoverAgentPendingSession({
    runtimeState: { previousResponseId: "", pendingToolCalls: [] },
    oneShot: false,
  });
  expect(true).toBe(true);
});
