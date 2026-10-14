process.env.AGENTX_WORKER_SPAWN_CASES = "1,2,3";
await jest.isolateModulesAsync(() => import("../test-fixtures/parallel-workers-spawn-suite.mjs"));
import { expect, jest, test } from "@jest/globals";
import { spawnWorker } from "../src/parallel-worker-spawn.mjs";

test("starts a worker and reports its state", async () => {
  const start = jest.fn(() => ({ id: "a", status: "running", startedAt: Date.now() }));
  const result = await spawnWorker({ task: "work" }, "/workspace", {}, start);
  expect(start).toHaveBeenCalledWith("work", "/workspace", "execute", false, undefined, undefined);
  expect(result.agent).toMatchObject({ id: "a", status: "running" });
});
