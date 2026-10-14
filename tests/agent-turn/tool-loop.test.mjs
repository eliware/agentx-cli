import { expect, jest, test } from "@jest/globals";
await jest.isolateModulesAsync(
  () => import("../../test-fixtures/agent-turn/tool-loop-empty-response-suite.mjs"),
);
await jest.isolateModulesAsync(
  () => import("../../test-fixtures/agent-turn/tool-loop-usage-accounting-suite.mjs"),
);
await jest.isolateModulesAsync(
  () => import("../../test-fixtures/agent-turn/tool-loop-response-state-suite.mjs"),
);
await jest.isolateModulesAsync(
  () => import("../../test-fixtures/agent-turn/tool-loop-status-integration-suite.mjs"),
);
await jest.isolateModulesAsync(
  () => import("../../test-fixtures/agent-turn/tool-loop-confirmation-integration-suite.mjs"),
);
await jest.isolateModulesAsync(
  () => import("../../test-fixtures/agent-turn/tool-loop-deduplication-suite.mjs"),
);
await jest.isolateModulesAsync(
  () => import("../../test-fixtures/agent-turn/tool-loop-worker-integration-suite.mjs"),
);
await jest.isolateModulesAsync(
  () => import("../../test-fixtures/agent-turn/tool-loop-ordering-suite.mjs"),
);
await import("../../test-fixtures/tool-loop-goals-suite.mjs");

test("the matching implementation exports its public function", async () => {
  const source = await import("../../src/agent-turn/tool-loop.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
