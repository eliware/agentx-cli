process.env.AGENTX_RUNTIME_CASES = "4";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, test } from "@jest/globals";
import { setupAgentRuntimeRecovery } from "../../src/agent/runtime-recovery-setup.mjs";
test("exposes runtime recovery setup", () => {
  expect(typeof setupAgentRuntimeRecovery).toBe("function");
});
