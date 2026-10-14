import { expect, jest, test } from "@jest/globals";
import { cancelWorkers } from "../src/parallel-worker-cancel.mjs";

test("reports an unknown worker when no record exists", async () => {
  const result = await cancelWorkers({ agent_ids: ["missing"] }, "/workspace", {
    state: { workers: new Map(), children: new Map() },
    readRecord: async () => null,
    persist: jest.fn(),
  });
  expect(result.agents).toEqual([{ id: "missing", status: "unknown" }]);
});

await jest.isolateModulesAsync(() => import("../test-fixtures/parallel-workers-race-suite.mjs"));
