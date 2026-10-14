process.env.AGENTX_RUNTIME_CASES = "8";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, test } from "@jest/globals";
import { createAgentRuntimeCommandServices } from "../../src/agent/runtime-command-services.mjs";
test("exposes runtime command services", () => {
  expect(typeof createAgentRuntimeCommandServices).toBe("function");
});
