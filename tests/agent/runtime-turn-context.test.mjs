process.env.AGENTX_RUNTIME_CASES = "7";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, test } from "@jest/globals";
import { createAgentRuntimeTurnContext } from "../../src/agent/runtime-turn-context.mjs";
test("exposes runtime turn context setup", () => {
  expect(typeof createAgentRuntimeTurnContext).toBe("function");
});
