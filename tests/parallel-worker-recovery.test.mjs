import { expect, jest, test } from "@jest/globals";
import { recoverWorkers } from "../src/parallel-worker-recovery.mjs";

test("recovers saved worker records into process state", async () => {
  const worker = { id: "a", status: "completed", started_at: new Date().toISOString() };
  const state = { workers: new Map() };
  await recoverWorkers("/workspace", {
    cleanup: jest.fn(),
    list: async () => [worker],
    readLog: async () => "done",
    persist: jest.fn(),
    state,
  });
  expect(state.workers.get("a")).toMatchObject({ output: "done", exited: true });
});

await jest.isolateModulesAsync(
  () => import("../test-fixtures/parallel-workers-recovery-suite.mjs"),
);
