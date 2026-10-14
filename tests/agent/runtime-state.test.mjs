process.env.AGENTX_RUNTIME_CASES = "9";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, test } from "@jest/globals";
import { createAgentRuntimeState } from "../../src/agent/runtime-state.mjs";

test("initializes mutable runtime state from the restored session", () => {
  const session = {
    template: { model: "gpt-6-luna" },
    outputFlags: { debug: true },
    restoredSession: { previousResponseId: "resp-1", sessionUsage: { turns: 1 } },
  };
  expect(createAgentRuntimeState(session)).toMatchObject({
    template: session.template,
    debugEnabled: true,
    previousResponseId: "resp-1",
    sessionUsage: { turns: 1 },
    pendingToolCalls: undefined,
  });
});
