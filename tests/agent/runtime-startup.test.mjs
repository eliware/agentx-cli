process.env.AGENTX_RUNTIME_CASES = "6";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, test } from "@jest/globals";
import { startAgentRuntime } from "../../src/agent/runtime-startup.mjs";
test("exposes runtime startup", () => {
  expect(typeof startAgentRuntime).toBe("function");
});
