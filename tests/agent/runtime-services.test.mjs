process.env.AGENTX_RUNTIME_CASES = "5";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, test } from "@jest/globals";
import { createAgentRuntimeServices } from "../../src/agent/runtime-services.mjs";
test("exposes runtime service setup", () => {
  expect(typeof createAgentRuntimeServices).toBe("function");
});
